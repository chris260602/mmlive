export const isProd = ()=>{
    const prodEnv = process.env.NODE_ENV || "development"
    return prodEnv === "production"
}

export const isLocal = () =>{
    const localEnv = process.env.NODE_ENV || "local"
    return localEnv === "local"
}