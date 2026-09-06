# Shared scientific projection; never executes a solver or publishes files.
module FuseProjection
using FUSE, IMAS, JSON
export write_json, json_safe, project_physics
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


function project_physics(dd; run_id::String, core_transport_model::String, equilibrium_origin::String)
    UNAVAILABLE = String[]
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
    add_profile("rotation","Sonic toroidal rotation frequency",rho,opt(cp,:rotation_frequency_tor_sonic,"rotation"),"rho_tor_norm","s^-1","core_profiles.profiles_1d.rotation_frequency_tor_sonic")
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
        source_name = string(getproperty(source.identifier,:name,"Unnamed source index $(source.identifier.index)"))
        push!(sources, Dict("prefix"=>prefix, "name"=>source_name, "index"=>source.identifier.index, "timeSeconds"=>s.time))
        for (suffix,ids,field,unit) in [("electron_heating",s.electrons,:energy,"W/m^3"),("ion_heating",s,:total_ion_energy,"W/m^3"),("electron_power",s.electrons,:power_inside,"W"),("ion_power",s,:total_ion_power_inside,"W"),("particles",s.electrons,:particles,"m^-3/s"),("j_parallel",s,:j_parallel,"A/m^2")]
            source_path = "core_sources.source.$i.profiles_1d." * (ids === s.electrons ? "electrons." : "") * string(field)
            add_profile(prefix*"_"*suffix,source_name*" "*suffix,x,opt(ids,field,prefix*"_"*suffix),"rho_tor_norm",unit,source_path)
        end
    end
    for (i, model) in enumerate(dd.core_transport.model)
        isempty(model.profiles_1d) && continue
        t = model.profiles_1d[]
        x = collect(t.grid_flux.rho_tor_norm)
        length(x) < 2 && continue
        for (suffix, ids, field, unit, field_path) in [("electron_heat",t.electrons.energy,:flux,"W/m^2","electrons.energy.flux"),("ion_heat",t.total_ion_energy,:flux,"W/m^2","total_ion_energy.flux"),("electron_particles",t.electrons.particles,:flux,"m^-2/s","electrons.particles.flux")]
            add_profile("transport_$(i)_"*suffix,string(getproperty(model.identifier,:name,"Unnamed transport model $i"))*" "*suffix,x,opt(ids,field,"transport_$(i)_"*suffix),"rho_tor_norm",unit,"core_transport.model.$i.profiles_1d."*field_path)
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
        "schema"=>"fuse-physics.v2", "authority"=>"simulated", "runId"=>run_id,
        "timeSeconds"=>eqt.time, "coreTimeSeconds"=>cp.time, "cocos"=>11,
        "equilibrium"=>Dict("r"=>R,"z"=>Z,"psi"=>[[Float64(psi[i,j]) for i in eachindex(R)] for j in eachindex(Z)],"arrayOrder"=>"z,r","psiUnit"=>"Wb","psiAxis"=>psia,"psiBoundary"=>psib,"boundary"=>pairs_rz(eqt.boundary.outline.r,eqt.boundary.outline.z),"axis"=>[eqt.global_quantities.magnetic_axis.r,eqt.global_quantities.magnetic_axis.z],"wall"=>pairs_rz(wall.r,wall.z),"contours"=>contours),
        "profiles"=>profiles, "sources"=>sources, "geometry"=>Dict("layers"=>layers,"coils"=>coils),
        "unavailable"=>unique(UNAVAILABLE), "coreTransportModel"=>core_transport_model,
        "nativeFormat"=>"OMAS HDF5 with FUSE extensions; explicit data, freeze=false",
        "versions"=>Dict("fuse"=>string(Base.pkgversion(FUSE)),"imas"=>string(Base.pkgversion(IMAS)),"julia"=>string(VERSION)),
        "equilibriumOrigin"=>equilibrium_origin,
        "derivation"=>"COCOS 11; psi[z][r]; contours from IMAS.flux_surface on the archived rectangular grid; unavailable samples null"
    )
    
    return physics
end
end
