#!/usr/bin/env julia

using Dates
using FUSE
using IMAS
using JSON
using Pkg
using SHA

const FUSE_BASE = ENV["FUSE_WORKSPACE"]
const OUTPUT_DIR = ENV["FUSE_DEMO_OUTPUT_DIR"]
mkpath(OUTPUT_DIR)

function json_safe(value)
    if value === missing || value === nothing
        return nothing
    elseif value isa AbstractFloat
        return isfinite(value) ? value : string(value)
    elseif value isa Integer || value isa Bool || value isa AbstractString
        return value
    elseif value isa Number
        try
            converted = Float64(value)
            return isfinite(converted) ? converted : string(converted)
        catch
            return string(value)
        end
    elseif value isa AbstractArray || value isa Tuple
        return [json_safe(item) for item in value]
    elseif value isa NamedTuple
        return Dict(string(key) => json_safe(item) for (key, item) in pairs(value))
    elseif value isa AbstractDict
        return Dict(string(key) => json_safe(item) for (key, item) in pairs(value))
    end
    return string(value)
end

function write_json(path, value)
    open(path, "w") do io
        JSON.print(io, value, 2)
        println(io)
    end
end

println("[fpp-demo] Data classification: SIMULATED / MODEL-GENERATED; not facility observation")
println("[fpp-demo] Loading FPP case parameters")

const STATIONARY_CONVERGENCE_HISTORY = Float64[]

function FUSE.callback(
    actor::FUSE.ActorStationaryPlasma,
    callback_location::Symbol,
    ::Val{:capture_fpp_demo};
    total_error=nothing,
    kwargs...,
)
    if callback_location == :iteration_end && total_error !== nothing && !isempty(total_error)
        push!(STATIONARY_CONVERGENCE_HISTORY, Float64(total_error[end]))
    end
    return actor
end

started_at = now(UTC)
start_ns = time_ns()
ini, act = FUSE.case_parameters(:FPP)
FUSE.ini2json(ini, joinpath(OUTPUT_DIR, "input-ini.json"))
FUSE.act2json(act, joinpath(OUTPUT_DIR, "input-act.json"))
parameter_seconds = (time_ns() - start_ns) / 1.0e9

println("[fpp-demo] Initializing IMAS dd")
start_ns = time_ns()
dd = FUSE.init(ini, act)
initialization_seconds = (time_ns() - start_ns) / 1.0e9

println("[fpp-demo] Running ActorStationaryPlasma")
start_ns = time_ns()
stationary_actor = FUSE.ActorStationaryPlasma(dd, act)
actor_seconds = (time_ns() - start_ns) / 1.0e9

finished_at = now(UTC)

digest_path = joinpath(OUTPUT_DIR, "digest.txt")
open(digest_path, "w") do io
    redirect_stdout(io) do
        println("DATA CLASSIFICATION: SIMULATED / MODEL-GENERATED; NOT FACILITY OBSERVATION")
        FUSE.digest(dd; section=1, terminal_width=160, line_char='-')
    end
end

extracted = IMAS.extract(dd)
extracted_records = [
    Dict(
        "key" => string(key),
        "group" => string(xfun.group),
        "name" => string(xfun.name),
        "units" => xfun.units,
        "value" => json_safe(xfun.value),
        "error" => xfun.error === nothing ? nothing : sprint(showerror, xfun.error),
    ) for (key, xfun) in pairs(extracted)
]
sort!(extracted_records; by=record -> (lowercase(record["key"]), record["key"]))
write_json(joinpath(OUTPUT_DIR, "extracted-summary.json"), Dict(
    "schema_version" => 1,
    "data_classification" => "SIMULATED / MODEL-GENERATED; not facility observation",
    "case" => "FPP",
    "metrics" => extracted_records,
))

environment_manifest = joinpath(FUSE_BASE, "environment", "Manifest.toml")
manifest_sha256 = isfile(environment_manifest) ? bytes2hex(open(SHA.sha256, environment_manifest)) : nothing
convergence_threshold = Float64(stationary_actor.par.convergence_error)
final_convergence_error = isempty(STATIONARY_CONVERGENCE_HISTORY) ? nothing : STATIONARY_CONVERGENCE_HISTORY[end]
converged = final_convergence_error === nothing ? nothing : final_convergence_error <= convergence_threshold

provenance = Dict(
    "data_classification" => "SIMULATED / MODEL-GENERATED; not facility observation",
    "case" => "FPP",
    "workflow" => "case_parameters(:FPP) -> init -> ActorStationaryPlasma",
    "started_at_utc" => string(started_at),
    "finished_at_utc" => string(finished_at),
    "elapsed_seconds" => Dict(
        "case_parameters" => parameter_seconds,
        "initialization" => initialization_seconds,
        "stationary_actor" => actor_seconds,
        "total" => parameter_seconds + initialization_seconds + actor_seconds,
    ),
    "julia_version" => string(VERSION),
    "julia_threads" => Threads.nthreads(),
    "fuse_version" => string(Base.pkgversion(FUSE)),
    "fuse_source_commit" => get(ENV, "FUSE_SOURCE_COMMIT", "unknown"),
    "fuse_examples_commit" => get(ENV, "FUSE_EXAMPLES_COMMIT", "unknown"),
    "environment_manifest_sha256" => manifest_sha256,
    "global_time_seconds" => json_safe(dd.global_time),
    "stationary_convergence" => Dict(
        "history" => json_safe(STATIONARY_CONVERGENCE_HISTORY),
        "final_error" => json_safe(final_convergence_error),
        "threshold" => convergence_threshold,
        "converged" => converged,
        "iterations" => length(STATIONARY_CONVERGENCE_HISTORY),
        "maximum_iterations" => Int(stationary_actor.par.max_iterations),
    ),
    "core_transport_model" => string(stationary_actor.actor_tr.par.model),
)
write_json(joinpath(OUTPUT_DIR, "provenance.json"), provenance)

if converged !== true
    error(
        "ActorStationaryPlasma did not meet its convergence criterion; " *
        "final_error=$(repr(final_convergence_error)), threshold=$(convergence_threshold)"
    )
end

total_seconds = provenance["elapsed_seconds"]["total"]
structured_results_path = joinpath(OUTPUT_DIR, "extracted-summary.json")
provenance_path = joinpath(OUTPUT_DIR, "provenance.json")
println("[fpp-demo] Convergence history: $(repr(STATIONARY_CONVERGENCE_HISTORY))")
println(
    "[fpp-demo] Convergence passed: final_error=$(final_convergence_error) <= " *
    "threshold=$(convergence_threshold); iterations=$(length(STATIONARY_CONVERGENCE_HISTORY))/$(stationary_actor.par.max_iterations)"
)
println("[fpp-demo] Completed in $(round(total_seconds; digits=3)) s")
println("[fpp-demo] Digest: $(digest_path)")
println("[fpp-demo] Structured results: $(structured_results_path)")
println("[fpp-demo] Provenance: $(provenance_path)")

# Native data and an explicit, unit-preserving browser projection of this same run.
println("[fpp-visualization] Exporting native data and scientific fields")
FUSE.ini2json(ini, joinpath(OUTPUT_DIR, "resolved-ini.json"))
FUSE.act2json(act, joinpath(OUTPUT_DIR, "resolved-act.json"))
IMAS.imas2hdf(dd, joinpath(OUTPUT_DIR, "dd-native.h5"); freeze=false, strict=false, compress=3)
const UNAVAILABLE = String[]
function opt(ids, field, label)
    value = try getproperty(ids, field, missing) catch; missing end
    if value === missing || value === nothing
        push!(UNAVAILABLE, label)
        return nothing
    end
    if value isa AbstractArray
        return [v isa Number && isfinite(v) ? Float64(v) : nothing for v in value]
    end
    return value
end
function pairs_rz(r, z)
    length(r) == length(z) || error("Coordinate shape mismatch")
    all(isfinite, r) && all(isfinite, z) || error("Non-finite geometry")
    return [[Float64(r[i]), Float64(z[i])] for i in eachindex(r)]
end
eqt = dd.equilibrium.time_slice[]
cp = dd.core_profiles.profiles_1d[]
eq1 = eqt.profiles_1d
eq2 = findfirst(:rectangular, eqt.profiles_2d)
eq2 === nothing && error("No rectangular equilibrium grid")
R, Z = collect(eq2.grid.dim1), collect(eq2.grid.dim2)
psi = eq2.psi
@assert size(psi) == (length(R), length(Z))
@assert all(isfinite, psi) && all(diff(R) .> 0) && all(diff(Z) .> 0)
psia, psib = eq1.psi[1], eq1.psi[end]
@assert isfinite(psia) && isfinite(psib) && psia != psib
wall = IMAS.first_wall(dd.wall; simplify_to_inscribed_fractional_area=1.0)
contours = [Dict("psiNorm"=>eta, "paths"=>[pairs_rz(p.r,p.z) for p in IMAS.flux_surface(eqt, psia+eta*(psib-psia), :closed, wall.r, wall.z)]) for eta in 0.1:0.1:0.9]
profiles = Any[]
function add_profile(id, label, x, y, axis, unit, source)
    if y === nothing || isempty(y) || all(isnothing, y)
        push!(UNAVAILABLE, id)
        return
    end
    length(x) == length(y) || error("Profile shape mismatch: $id")
    all(isfinite, x) && all(diff(x) .> 0) || error("Invalid profile axis: $id")
    any(isnothing, y) && push!(UNAVAILABLE, id * ":partial-missing-samples")
    push!(profiles, Dict("id"=>id, "label"=>label, "x"=>collect(x), "y"=>y, "axis"=>axis, "unit"=>unit, "source"=>source))
end
rho = collect(cp.grid.rho_tor_norm)
add_profile("te","Electron temperature",rho,opt(cp.electrons,:temperature,"te"),"rho_tor_norm","eV","core_profiles.profiles_1d.electrons.temperature")
add_profile("ti","Average ion temperature",rho,opt(cp,:t_i_average,"ti"),"rho_tor_norm","eV","core_profiles.profiles_1d.t_i_average")
add_profile("ne","Electron density",rho,opt(cp.electrons,:density,"ne"),"rho_tor_norm","m^-3","core_profiles.profiles_1d.electrons.density")
for (id,field) in [("j_tor",:j_tor),("j_parallel",:j_total),("j_bootstrap",:j_bootstrap),("j_ohmic",:j_ohmic)]
    add_profile(id,id,rho,opt(cp,field,id),"rho_tor_norm","A/m^2","core_profiles.profiles_1d."*string(field))
end
psin = [(p-psia)/(psib-psia) for p in eq1.psi]
add_profile("q","Safety factor",psin,opt(eq1,:q,"q"),"psi_norm","1","equilibrium.time_slice.profiles_1d.q")
add_profile("pressure","Equilibrium pressure",psin,opt(eq1,:pressure,"pressure"),"psi_norm","Pa","equilibrium.time_slice.profiles_1d.pressure")
add_profile("eq_j_tor","Equilibrium toroidal current",psin,opt(eq1,:j_tor,"eq_j_tor"),"psi_norm","A/m^2","equilibrium.time_slice.profiles_1d.j_tor")
for (i,ion) in enumerate(cp.ion)
    ion_label = string(getproperty(ion, :label, "Ion $i"))
    add_profile("ion_$(i)_temperature",ion_label * " temperature",rho,opt(ion,:temperature,"ion-temperature-$i"),"rho_tor_norm","eV","core_profiles.profiles_1d.ion.$i.temperature")
    add_profile("ion_$(i)_density",ion_label * " density",rho,opt(ion,:density,"ion-density-$i"),"rho_tor_norm","m^-3","core_profiles.profiles_1d.ion.$i.density")
end
sources = Any[]
for (i, source) in enumerate(dd.core_sources.source)
    isempty(source.profiles_1d) && continue
    s = source.profiles_1d[]
    x = collect(s.grid.rho_tor_norm)
    prefix = "source_$(i)"
    push!(sources, Dict("prefix"=>prefix, "name"=>string(source.identifier.name), "index"=>source.identifier.index, "timeSeconds"=>s.time))
    for (suffix,ids,field,unit) in [("electron_heating",s.electrons,:energy,"W/m^3"),("ion_heating",s,:total_ion_energy,"W/m^3"),("electron_power",s.electrons,:power_inside,"W"),("ion_power",s,:total_ion_power_inside,"W"),("particles",s.electrons,:particles,"m^-3/s"),("j_parallel",s,:j_parallel,"A/m^2")]
        source_path = "core_sources.source.$i.profiles_1d." * (ids === s.electrons ? "electrons." : "") * string(field)
        add_profile(prefix*"_"*suffix,string(source.identifier.name)*" "*suffix,x,opt(ids,field,prefix*"_"*suffix),"rho_tor_norm",unit,source_path)
    end
end
layers = [Dict("name"=>string(layer.name), "material"=>string(layer.material), "thicknessM"=>json_safe(layer.thickness), "outline"=>pairs_rz(layer.outline.r, layer.outline.z)) for layer in dd.build.layer if !isempty(layer.outline.r)]
coils = Any[]
for (i,coil) in enumerate(dd.pf_active.coil)
    elements = Any[]
    for element in coil.element
        outline = IMAS.outline(element)
        push!(elements, Dict("geometryType"=>element.geometry.geometry_type, "outline"=>pairs_rz(outline.r,outline.z)))
    end
    push!(coils, Dict("name"=>string(coil.name), "elements"=>elements, "timeSeconds"=>opt(coil.current,:time,"coil-$i-time"), "currentA"=>opt(coil.current,:data,"coil-$i-current")))
end
physics = Dict(
    "schema"=>"fuse-physics.v1", "authority"=>"simulated", "runId"=>ENV["FUSE_RUN_ID"],
    "timeSeconds"=>eqt.time, "coreTimeSeconds"=>cp.time, "cocos"=>11,
    "equilibrium"=>Dict("r"=>R,"z"=>Z,"psi"=>[[Float64(psi[i,j]) for i in eachindex(R)] for j in eachindex(Z)],"arrayOrder"=>"z,r","psiUnit"=>"Wb","psiAxis"=>psia,"psiBoundary"=>psib,"boundary"=>pairs_rz(eqt.boundary.outline.r,eqt.boundary.outline.z),"axis"=>[eqt.global_quantities.magnetic_axis.r,eqt.global_quantities.magnetic_axis.z],"wall"=>pairs_rz(wall.r,wall.z),"contours"=>contours),
    "profiles"=>profiles, "sources"=>sources, "geometry"=>Dict("layers"=>layers,"coils"=>coils),
    "unavailable"=>unique(UNAVAILABLE), "coreTransportModel"=>provenance["core_transport_model"],
    "nativeFormat"=>"OMAS HDF5 with FUSE extensions; explicit data, freeze=false",
    "versions"=>Dict("fuse"=>string(Base.pkgversion(FUSE)),"imas"=>string(Base.pkgversion(IMAS)),"julia"=>string(VERSION)),
    "derivation"=>"COCOS 11; psi[z][r]; contours from IMAS.flux_surface on the solved rectangular grid; unavailable samples null"
)
write_json(joinpath(OUTPUT_DIR,"physics.json"),physics)
metric_map = Dict(String(r["key"])=>r["value"] for r in extracted_records)
metric_keys = Dict("major_radius_m"=>"R0","minor_radius_m"=>"a","toroidal_field_T"=>"B0","plasma_current_MA"=>"ip","q95"=>"q95","central_electron_temperature_keV"=>"Te0","central_ion_temperature_keV"=>"Ti0","central_electron_density_m-3"=>"ne0","fusion_power_MW"=>"Pfusion","fusion_gain_Q"=>"Qfusion","auxiliary_power_MW"=>"Paux_tot","power_through_separatrix_MW"=>"Psol","H98y2"=>"H98y2")
hash_file(p) = bytes2hex(open(SHA.sha256,p))
artifacts = Dict(replace(name,"."=>"_")=>Dict("path"=>name,"sha256"=>hash_file(joinpath(OUTPUT_DIR,name))) for name in ["physics.json","dd-native.h5","input-ini.json","input-act.json","resolved-ini.json","resolved-act.json","digest.txt","extracted-summary.json","provenance.json"])
manifest = Dict("schema_version"=>1,"record_kind"=>"simulation-run","authority"=>"simulated","run_id"=>ENV["FUSE_RUN_ID"],"source"=>Dict("fuse_version"=>string(Base.pkgversion(FUSE)),"fuse_commit"=>ENV["FUSE_SOURCE_COMMIT"],"julia_version"=>string(VERSION),"julia_threads"=>Threads.nthreads(),"project_sha256"=>hash_file(joinpath(FUSE_BASE,"environment","Project.toml")),"manifest_sha256"=>hash_file(environment_manifest),"demo_script_sha256"=>hash_file(@__FILE__)),"execution"=>Dict("exit_code"=>0,"simulation_stage_seconds"=>total_seconds,"stationary_convergence"=>provenance["stationary_convergence"]),"key_metrics"=>Dict(k=>metric_map[v] for (k,v) in metric_keys),"artifacts"=>artifacts)
write_json(joinpath(OUTPUT_DIR,"run-manifest.json"),manifest)
println("[fpp-visualization] Exported grid $(length(R)) x $(length(Z)), $(length(profiles)) profiles, $(length(layers)) design layers, $(length(coils)) coils")
