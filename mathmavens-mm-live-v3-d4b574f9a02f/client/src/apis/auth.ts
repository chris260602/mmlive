import { ROOM_TYPE } from "@/types/room"
import { USER_DATA_TYPE } from "@/types/user"
import axios from "axios"

export const me = async (tokenData:string) : Promise<USER_DATA_TYPE|undefined> =>{
    const url = process.env.NEXT_PUBLIC_AUTH_API || ""
    try{
        const response =  await axios.get( `${url}/auth/me` ,{ headers: { 'Authorization': `Bearer ${tokenData}`} })
        return response.data.data
    }
    catch(error){
        console.log(error.response.data.message)
        return undefined
    }
}

export const getAuthRooms = async (tokenData:string) : Promise<ROOM_TYPE[]> =>{
    const url = process.env.NEXT_PUBLIC_AUTH_API || ""
    try{
        const response = await axios.get( `${url}/elearning` ,{ headers: { 'Authorization': `Bearer ${tokenData}`} });
        return response.data.data
        
    }catch(err){
        console.log(err.response.data.message)
        return []
    }
    // axios.get( `${url}/elearning` ,{ headers: { 'Authorization': `Bearer ${tokenData}`} }).then( function(response){
    //     console.log(response.data.data)
    //     return response.data.data
    // }).catch(function(error){
    //     console.log(error.response.data.message)
    //     return []
    // })
}