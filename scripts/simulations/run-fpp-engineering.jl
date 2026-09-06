using FUSE, IMAS, JSON, SHA
include("FuseProjection.jl")
using .FuseProjection
const OUT = ENV["FUSE_DEMO_OUTPUT_DIR"]
hash_file(p)=bytes2hex(open(SHA.sha256,p))
const PARENT="fuse-fpp-20260907-003257-48a4fa67"
@assert hash_file(joinpath(OUT,"parent-manifest.json")) == "7bc4af2942c024b1033bc6e25da6cb1d43f7cf9fb946388a84e3ad0ba9f19433"
@assert hash_file(joinpath(OUT,"parent-provenance.json")) == "d8173b3d5b8b62287fd49252b279f75aa9a9e42f5bbaaf3b639061b3489dd949"
@assert hash_file(joinpath(OUT,"parent-dd.h5")) == "86a7d56d72355c986dd66326a2a93ed67f5b4243a50087d13f4d37c6d68999df"
@assert hash_file(joinpath(OUT,"parent-act.json")) == "45598ff256cf2086397e268cce57ec912338b09c11ece93b9eab7393b8a8b8ab"
provenance=JSON.parsefile(joinpath(OUT,"parent-provenance.json"))
@assert provenance["stationary_convergence"]["converged"] === true
@assert hash_file(joinpath(ENV["FUSE_WORKSPACE"],"environment","Manifest.toml")) == provenance["environment_manifest_sha256"]
started=time_ns()
dd0=IMAS.hdf2imas(joinpath(OUT,"parent-dd.h5");error_on_missing_coordinates=true)
act0=FUSE.json2act(joinpath(OUT,"parent-act.json"),FUSE.ParametersActors())
IMAS.global_time(dd0,provenance["global_time_seconds"])
# Each Actor step synchronizes its own parameter time with dd.global_time.
@assert dd0.build.tf.nose_hfs_fraction == 0 && dd0.solid_mechanics.center_stack.plug == 0
geometry(dd)=[(collect(l.outline.r),collect(l.outline.z),l.thickness,string(l.material)) for l in dd.build.layer]
before=deepcopy(geometry(dd0))
dd=deepcopy(dd0); act=deepcopy(act0)
act.ActorFluxSwing.operate_oh_at_j_crit=true
println("[engineering] FluxSwing: maximum OH capability, fixed geometry")
FUSE.ActorFluxSwing(dd,act)
function scalar(ids,field,unit)
    if ismissing(ids,field)
        return Dict("value"=>nothing,"unit"=>unit,"status"=>"missing")
    end
    v=Float64(getproperty(ids,field))
    status=isnan(v) ? "nan" : isinf(v) ? (v>0 ? "positive-infinity" : "negative-infinity") : "finite"
    return Dict("value"=>(isfinite(v) ? v : nothing),"unit"=>unit,"status"=>status)
end
metrics=Dict(
    "rampup_flux"=>scalar(dd.build.flux_swing,:rampup,"Wb"),"flattop_flux"=>scalar(dd.build.flux_swing,:flattop,"Wb"),"pf_flux"=>scalar(dd.build.flux_swing,:pf,"Wb"),
    "flattop_duration"=>scalar(dd.build.oh,:flattop_duration,"s"),"oh_current_density"=>scalar(dd.build.oh,:max_j,"A/m^2"),"oh_field"=>scalar(dd.build.oh,:max_b_field,"T"),
    "tf_current_density"=>scalar(dd.build.tf,:max_j,"A/m^2"),"tf_field"=>scalar(dd.build.tf,:max_b_field,"T"))
branches=Any[]
for n in [101,201,401]
    println("[engineering] Stresses: $n sampling points")
    branch=deepcopy(dd); branch_act=deepcopy(act)
    branch_act.ActorStresses.n_points=n;branch_act.ActorStresses.do_plot=false
    FUSE.ActorStresses(branch,branch_act)
    @assert before == geometry(branch) "Geometry changed"
    sm=branch.solid_mechanics.center_stack
    parts=Any[]
    for part in [:tf,:oh]
        r=collect(getproperty(sm.grid,Symbol("r_"*string(part))))
        fields=Dict("radialPa"=>collect(getproperty(sm.stress.radial,part)),"hoopPa"=>collect(getproperty(sm.stress.hoop,part)),"vonMisesPa"=>collect(getproperty(sm.stress.vonmises,part)),"displacementM"=>collect(getproperty(sm.displacement,part)))
        @assert length(r)==n && all(isfinite,r) && all(diff(r).>0)
        @assert all(length(v)==length(r) && all(isfinite,v) for v in values(fields))
        axial=Float64(getproperty(sm.stress.axial,part));@assert isfinite(axial)
        push!(parts,merge(Dict("id"=>string(part),"r"=>r,"axialPa"=>axial),fields))
    end
    push!(branches,Dict("samplingPoints"=>n,"parts"=>parts))
    IMAS.imas2hdf(branch,joinpath(OUT,"stress-$n.h5");freeze=false,strict=false,compress=3)
    restored=IMAS.hdf2imas(joinpath(OUT,"stress-$n.h5");error_on_missing_coordinates=true).solid_mechanics.center_stack
    for part in [:tf,:oh]
        @assert getproperty(restored.grid,Symbol("r_"*string(part))) == getproperty(sm.grid,Symbol("r_"*string(part)))
        @assert getproperty(restored.displacement,part) == getproperty(sm.displacement,part)
        for field in [:radial,:hoop,:vonmises,:axial]
            @assert getproperty(getproperty(restored.stress,field),part) == getproperty(getproperty(sm.stress,field),part)
        end
    end
    FUSE.act2json(branch_act,joinpath(OUT,"stress-$n-act.json"))
end
@assert before == geometry(dd)
projection=Dict("schema"=>"fuse-engineering.v1","runId"=>ENV["FUSE_RUN_ID"],"parentRunId"=>PARENT,
    "parentRecordSha256"=>hash_file(joinpath(OUT,"parent-manifest.json")),"authority"=>"simulated",
    "model"=>"1D analytical cylindrical center stack","mode"=>"maximum-flattop-capability-at-oh-current-margin",
    "timeSeconds"=>dd.global_time,"geometryUnchanged"=>true,"deviceValidated"=>false,"allowableStressAssessed"=>false,
    "metrics"=>metrics,"branches"=>branches,"fuseVersion"=>string(Base.pkgversion(FUSE)),
    "assumptions"=>["Fixed FPP geometry, no TF nose or center plug","OH operated at configured critical-current margin; no requested pulse duration","101/201/401 are analytical sampling densities, not finite-element meshes","Axial stress uses sampled hoop-stress average; sample count can change von Mises stress","OH on/off case selected by each component peak, not pointwise envelope","No material allowable-stress qualification or uncertainty estimate"])
write_json(joinpath(OUT,"engineering.json"),projection)
names=["engineering.json","parent-manifest.json","parent-dd.h5","parent-act.json","parent-provenance.json","run-fpp-engineering.jl","FuseProjection.jl",["stress-$n.h5" for n in [101,201,401]]...,["stress-$n-act.json" for n in [101,201,401]]...]
write_json(joinpath(OUT,"run-manifest.json"),Dict("schema"=>"fuse-engineering-manifest.v1","runId"=>ENV["FUSE_RUN_ID"],"execution"=>"succeeded","elapsedSeconds"=>(time_ns()-started)/1e9,
    "nativeRoundtrip"=>true,"versions"=>Dict("fuse"=>string(Base.pkgversion(FUSE)),"imas"=>string(Base.pkgversion(IMAS)),"julia"=>string(VERSION)),
    "artifacts"=>[Dict("name"=>n,"sha256"=>hash_file(joinpath(OUT,n))) for n in names]))
println("[engineering] Completed: finite stress/displacement arrays, unchanged geometry; no engineering qualification inferred")
