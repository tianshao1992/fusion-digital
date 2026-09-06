#!/usr/bin/env julia
# Only offline, pinned sample recipes. No shot fetching, shell commands or publishing.
using Dates, FUSE, IMAS, JSON, SHA, LinearAlgebra
include("FuseProjection.jl")
using .FuseProjection
const OUTPUT = ENV["FUSE_DEMO_OUTPUT_DIR"]
const SPEC = JSON.parsefile(joinpath(OUTPUT, "run-spec.json"))
const EVENTS = Any[]
const HISTORY = Float64[]
const INNER_HISTORY = Any[]
hash_file(p) = bytes2hex(open(SHA.sha256, p))
function event(stage, state; details=Dict())
    entry = Dict("stage"=>stage,"state"=>state,"timeUtc"=>string(now(UTC)),"details"=>details)
    push!(EVENTS, entry)
    write_json(joinpath(OUTPUT,"stages.json"), EVENTS)
    println("[stage] $stage $state")
    flush(stdout)
end
function FUSE.callback(actor::FUSE.ActorStationaryPlasma, location::Symbol, ::Val{:capture_fpp_demo}; total_error=nothing, kwargs...)
    if location == :iteration_end && total_error !== nothing
        push!(HISTORY, Float64(total_error[end]))
        inner = actor.actor_tr.tr_actor
        push!(INNER_HISTORY, Dict("iteration"=>length(HISTORY),"selectedResidual"=>Float64(inner.error),"evaluationResiduals"=>map(norm,inner.err_history)))
        event("stationary-iteration", "reported"; details=Dict("iteration"=>length(HISTORY),"error"=>HISTORY[end]))
    end
    return actor
end
function transport_diagnostics(actor)
    targets = FUSE.flux_match_targets(actor.dd, actor.par)
    fluxes = FUSE.flux_match_fluxes(actor.dd, actor.par)
    n = length(actor.par.rho_transport)
    channels = [("electron_heat", "W/m^2"), ("ion_heat", "W/m^2")]
    # FUSE torque/surface and GACODE gyrobohm_momentum_flux use kg/s^2.
    # IMASdd's field metadata says kg/m/s^2; preserve the implementation value.
    actor.par.evolve_rotation == :flux_match && push!(channels, ("momentum", "kg/s^2"))
    # Both approved recipes evolve electrons and scale ions for quasi-neutrality.
    push!(channels, ("electron_particles", "m^-2/s"))
    length(targets) == length(fluxes) == n * length(channels) || error("Unexpected flux channel mapping")
    all(isfinite, targets) && all(isfinite, fluxes) || error("Non-finite physical fluxes")
    return Dict("rho"=>collect(actor.par.rho_transport),"channels"=>[
        Dict("id"=>name,"unit"=>unit,"target"=>targets[(i-1)*n+1:i*n],"model"=>fluxes[(i-1)*n+1:i*n]) for (i,(name,unit)) in enumerate(channels)
    ],"selectedResidual"=>Float64(actor.error),"evaluationResiduals"=>map(norm,actor.err_history),
    "xtol"=>actor.par.xtol,"residualCriterion"=>nothing,
    "derivation"=>"FUSE targets/fluxes; nearest source-grid samples; selected residual differs from last history; xtol is a step tolerance; momentum kg/s^2 follows torque/surface and GACODE implementation, not IMASdd kg/m/s^2 metadata")
end
function run_recipe()
    start = time_ns()
    recipe, model = SPEC["recipe"], SPEC["model"]
    recipe in ["diiid-lmode-fluxmatch", "diiid-default-stationary"] || error("Unapproved recipe")
    model in ["TGLFNN", "GKNN", "QLNN"] || error("Unapproved model")
    recipe == "diiid-default-stationary" && model != "TGLFNN" && error("Stationary recipe only approved for TGLFNN")
    case = recipe == "diiid-lmode-fluxmatch" ? :L_mode : :default
    event("case-parameters", "running")
    ini, act = FUSE.case_parameters(:D3D, case)
    FUSE.ini2json(ini, joinpath(OUTPUT,"input-ini.json"))
    FUSE.act2json(act, joinpath(OUTPUT,"input-act.json"))
    event("initialization", "running")
    dd = FUSE.init(ini, act)
    reference_cp = deepcopy(dd.core_profiles.profiles_1d[])
    reference_psi = deepcopy(findfirst(:rectangular, dd.equilibrium.time_slice[].profiles_2d).psi)
    IMAS.imas2hdf(dd, joinpath(OUTPUT,"initial-native.h5"); freeze=false, strict=false, compress=3)
    event("initialization", "succeeded"; details=Dict("case"=>string(case),"equilibriumOrigin"=>"input-reconstruction"))
    act.ActorCoreTransport.model = :FluxMatcher
    act.ActorTGLF.model = Symbol(model)
    act.ActorTGLF.onnx_model = false
    act.ActorTGLF.electromagnetic = true
    act.ActorTGLF.warn_nn_train_bounds = false # match pinned notebook; OOD is NOT assessed
    act.ActorFluxMatcher.max_iterations = SPEC["solver"]["maxIterations"]
    act.ActorFluxMatcher.xtol = SPEC["solver"]["xtol"]
    act.ActorFluxMatcher.algorithm = :simple_dfsane
    act.ActorFluxMatcher.step_size = 1.0
    act.ActorFluxMatcher.verbose = true
    act.ActorFluxMatcher.evolve_densities = :flux_match
    act.ActorFluxMatcher.evolve_pedestal = false
    if case == :L_mode
        act.ActorFluxMatcher.rho_transport = 0.1:0.05:0.85
        act.ActorFluxMatcher.evolve_rotation = :flux_match
        act.ActorTGLF.tglfnn_model = "sat3_em_d3d_azf-1_withnegD"
    else
        act.ActorFluxMatcher.evolve_rotation = :fixed
        act.ActorTGLF.tglfnn_model = "sat1_em_d3d"
        act.ActorStationaryPlasma.max_iterations = SPEC["solver"]["stationaryIterations"]
        act.ActorStationaryPlasma.convergence_error = SPEC["solver"]["stationaryThreshold"]
    end
    if model == "QLNN"
        act.ActorTGLF.tglfnn_model = "QLNN"
        act.ActorTGLF.sat_rule = :sat3
    end
    FUSE.act2json(act, joinpath(OUTPUT,"effective-act.json"))
    event(recipe, "running")
    if case == :L_mode
        actor = FUSE.ActorFluxMatcher(dd, act)
        flux_actor = actor
    else
        actor = FUSE.ActorStationaryPlasma(dd, act)
        flux_actor = actor.actor_tr.tr_actor
    end
    event(recipe, "succeeded")
    # Preserve expensive solver output even if a later projection fails.
    IMAS.imas2hdf(dd, joinpath(OUTPUT,"solved-native.h5"); freeze=false, strict=false, compress=3)
    if case != :L_mode
        # Explicit post-coupling consistency check on the final equilibrium.
        # Does not evolve profiles; the last inner solver residual remains separate.
        event("post-coupling-flux-check", "running")
        FUSE.ActorFluxCalculator(dd, act; rho_transport=flux_actor.par.rho_transport)
        event("post-coupling-flux-check", "succeeded")
    end
    diagnostics = transport_diagnostics(flux_actor)
    diagnostics["stateRelation"] = case == :L_mode ? "same-state" : "post-coupling-recomputed"
    event("projection", "running")
    physics = project_physics(dd; run_id=ENV["FUSE_RUN_ID"], core_transport_model="FluxMatcher/"*model,
        equilibrium_origin=case == :L_mode ? "input-reconstruction" : "model-solved")
    physics["fluxMatch"] = diagnostics
    physics["reference"] = Dict("authority"=>"upstream-initialized-reference", "timeSeconds"=>reference_cp.time,
        "rho"=>collect(reference_cp.grid.rho_tor_norm), "te"=>collect(reference_cp.electrons.temperature),
        "ti"=>collect(reference_cp.t_i_average), "ne"=>collect(reference_cp.electrons.density),
        "description"=>case == :L_mode ? "Initialized upstream L-mode example; not raw diagnostics; no shot ID supplied" : "Parameterized profiles initialized on upstream equilibrium; not observed profiles")
    write_json(joinpath(OUTPUT,"physics.json"),physics)
    IMAS.imas2hdf(dd, joinpath(OUTPUT,"dd-native.h5"); freeze=false, strict=false, compress=3)
    FUSE.ini2json(ini, joinpath(OUTPUT,"resolved-ini.json"))
    FUSE.act2json(act, joinpath(OUTPUT,"resolved-act.json"))
    # Check actual native roundtrip, not only successful serialization.
    reloaded = IMAS.hdf2imas(joinpath(OUTPUT,"dd-native.h5"))
    cp, cp2 = dd.core_profiles.profiles_1d[], reloaded.core_profiles.profiles_1d[]
    function equal_science(a,b)
        if a isa Number && b isa Number
            return isapprox(a,b;rtol=1e-10,atol=1e-12)
        elseif a isa AbstractDict && b isa AbstractDict
            return keys(a)==keys(b) && all(equal_science(a[k],b[k]) for k in keys(a))
        elseif a isa AbstractArray && b isa AbstractArray
            return size(a)==size(b) && all(equal_science(x,y) for (x,y) in zip(a,b))
        end
        return a==b
    end
    roundtrip_projection = project_physics(reloaded; run_id=ENV["FUSE_RUN_ID"],core_transport_model=physics["coreTransportModel"],equilibrium_origin=physics["equilibriumOrigin"])
    roundtrip = all(equal_science(physics[k],roundtrip_projection[k]) for k in ["equilibrium","profiles","sources","geometry","timeSeconds","coreTimeSeconds","unavailable"])
    roundtrip || error("Native HDF5 roundtrip mismatch")
    final_psi = findfirst(:rectangular,dd.equilibrium.time_slice[].profiles_2d).psi
    fixed_equilibrium = size(reference_psi) == size(final_psi) && reference_psi == final_psi
    case == :L_mode && !fixed_equilibrium && error("Fixed-equilibrium recipe changed psi")
    checks = Dict("nativeRoundtrip"=>roundtrip,"finiteGrid"=>all(isfinite,final_psi),"positiveTe"=>all(cp.electrons.temperature .> 0),"positiveNe"=>all(cp.electrons.density .> 0),"fixedEquilibrium"=>fixed_equilibrium,"deviceValidated"=>false,"oodAssessed"=>false)
    all(checks[k] for k in ["nativeRoundtrip","finiteGrid","positiveTe","positiveNe"]) || error("Invalid scientific output")
    write_json(joinpath(OUTPUT,"checks.json"),checks)
    write_json(joinpath(OUTPUT,"inner-history.json"),INNER_HISTORY)
    event("projection", "succeeded"; details=checks)
    elapsed = (time_ns()-start)/1e9
    manifest = Dict("schema"=>"fuse-native-run.v2","runId"=>ENV["FUSE_RUN_ID"],"recipe"=>recipe,"model"=>model,
        "authority"=>"simulated","execution"=>"succeeded","elapsedSeconds"=>elapsed,
        "versions"=>Dict("fuse"=>string(Base.pkgversion(FUSE)),"imas"=>string(Base.pkgversion(IMAS)),"julia"=>string(VERSION)),
        "threads"=>Threads.nthreads(),"fuseCommit"=>SPEC["engineCommit"],"selectedResidual"=>diagnostics["selectedResidual"],
        "evaluationCount"=>length(diagnostics["evaluationResiduals"]),"stationaryHistory"=>HISTORY,
        "stationaryThreshold"=>SPEC["solver"]["stationaryThreshold"],"checks"=>checks,
        "artifacts"=>[Dict("name"=>name,"sha256"=>hash_file(joinpath(OUTPUT,name))) for name in ["physics.json","initial-native.h5","dd-native.h5","input-ini.json","input-act.json","effective-act.json","resolved-ini.json","resolved-act.json","checks.json","stages.json","inner-history.json","run-spec.json","environment-lock.json","run-diiid.jl","FuseProjection.jl"]])
    write_json(joinpath(OUTPUT,"run-manifest.json"),manifest)
    println("[completed] "*ENV["FUSE_RUN_ID"]*" selected residual="*string(diagnostics["selectedResidual"]))
end
try
    run_recipe()
catch err
    event("execution", "failed"; details=Dict("errorType"=>string(typeof(err))))
    rethrow()
end
