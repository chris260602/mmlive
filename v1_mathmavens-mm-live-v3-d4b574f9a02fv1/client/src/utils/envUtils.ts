export const isProd = ()=>{
    const prodEnv = process.env.NEXT_PUBLIC_FE_ENV || "development"
    return prodEnv === "production"
}

export const isLocal = () =>{
    const localEnv = process.env.NEXT_PUBLIC_FE_ENV || "local"
    return localEnv === "local"
}