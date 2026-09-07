using FUSE, IMAS, JSON, SHA

function argument(name::String)
    index = findfirst(==(name), ARGS)
    index === nothing && error("Missing argument: $name")
    index == length(ARGS) && error("Missing value for argument: $name")
    return ARGS[index + 1]
end

function sha256_file(path::String)
    return bytes2hex(open(sha256, path))
end

function native_digest(manifest)
    artifacts = manifest["artifacts"]
    if artifacts isa AbstractVector
        item = only(filter(entry -> entry["name"] == "dd-native.h5", artifacts))
        return item["sha256"]
    end
    return artifacts["dd-native_h5"]["sha256"]
end

fuse_root = abspath(argument("--fuse-root"))
bundle_path = abspath(argument("--bundle-catalog"))
output_path = abspath(argument("--output"))
projector_sha = sha256_file(@__FILE__)
bundles = JSON.parsefile(bundle_path)
maps = Any[]

for bundle in bundles
    run_id = bundle["runId"]
    result_path = joinpath(fuse_root, "results", run_id)
    native_path = joinpath(result_path, "dd-native.h5")
    physics_path = joinpath(result_path, "physics.json")
    manifest_path = joinpath(result_path, "run-manifest.json")
    all(isfile, [native_path, physics_path, manifest_path]) || error("Missing native result for $run_id")
    manifest = JSON.parsefile(manifest_path)
    native_sha = sha256_file(native_path)
    native_sha == native_digest(manifest) || error("Native manifest mismatch for $run_id")
    sha256_file(physics_path) == bundle["rawSha256"] || error("Physics projection mismatch for $run_id")

    dd = IMAS.hdf2imas(native_path)
    equilibrium = dd.equilibrium.time_slice[]
    core = dd.core_profiles.profiles_1d[]
    psi_norm = Float64.(collect(equilibrium.profiles_1d.psi_norm))
    rho_tor_norm = Float64.(collect(equilibrium.profiles_1d.rho_tor_norm))
    length(psi_norm) == length(rho_tor_norm) >= 3 || error("Coordinate shape mismatch for $run_id")
    all(isfinite, psi_norm) && all(isfinite, rho_tor_norm) || error("Non-finite coordinate map for $run_id")
    all(diff(psi_norm) .> 0) && all(diff(rho_tor_norm) .> 0) || error("Non-monotonic coordinate map for $run_id")
    all(isapprox.([psi_norm[1], psi_norm[end], rho_tor_norm[1], rho_tor_norm[end]], [0.0, 1.0, 0.0, 1.0]; atol=1e-10, rtol=0.0)) || error("Incomplete coordinate map for $run_id")

    physics = JSON.parsefile(physics_path)
    equilibrium.time == physics["timeSeconds"] || error("Equilibrium time mismatch for $run_id")
    core.time == physics["coreTimeSeconds"] || error("Core profile time mismatch for $run_id")
    equilibrium.time == core.time || error("Unaligned profile state for $run_id")
    map = Dict(
        "schema" => "fuse-flux-coordinate-map.v1",
        "authority" => "simulation-derived",
        "runId" => run_id,
        "source" => Dict(
            "nativeSha256" => native_sha,
            "physicsSha256" => bundle["rawSha256"],
            "equilibriumTimeSeconds" => equilibrium.time,
            "coreTimeSeconds" => core.time,
            "cocos" => 11,
            "psiNormPath" => "equilibrium.time_slice.profiles_1d.psi_norm",
            "rhoTorNormPath" => "equilibrium.time_slice.profiles_1d.rho_tor_norm",
        ),
        "psiNorm" => psi_norm,
        "rhoTorNorm" => rho_tor_norm,
        "method" => "native-equilibrium-coordinate-map",
        "interpolation" => "bounded-linear",
        "extrapolation" => "none",
        "assumptions" => ["axisymmetric-flux-function"],
        "projectorSha256" => projector_sha,
    )
    push!(maps, map)
end

open(output_path, "w") do io
    JSON.print(io, maps, 2)
    println(io)
end
println("Extracted $(length(maps)) FUSE flux-coordinate maps")
