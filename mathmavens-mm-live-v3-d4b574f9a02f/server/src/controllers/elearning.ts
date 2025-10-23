import { RequestHandler } from "express";
import axios from "axios";
import * as dotenv from "dotenv";
// import Elearning from "../db/models/Elearning";
import { v4 as uuidV4} from 'uuid';

dotenv.config();

export const createElearning: RequestHandler = async(req, res) =>{
    try {
        const token = req.headers.authorization
        const url = process.env.AUTH_API as string
        let userData:any = null

        await axios.get( url ,{ headers: { 'Authorization': token} }).then((response)=>{
            userData = response.data.data
        }).catch((error)=>{
            console.log(error.response.data.message)
            return res.status(500).json({
                status:500,
                message:error.response.data.message
            })
        })

        if (!userData){
            return res.status(500).json({
                status:500,
                message:'user not found'
            })
        }

        const meetingId = uuidV4();

        return res.status(201).json({
            status:201,
            message:'Created',
            meetingId
        });

    } catch (error) {
        if(error != null && error instanceof Error){
            return res.status(500).json({
                status:500,
                message:error.message,
                errors:error
            })
        }

        return res.status(500).json({
            status:500,
            message:'Internal server error',
            errors:error
        })
    }

}

export const getElearnings: RequestHandler = async(_req, res) =>{
    return res.status(200).json({
        status:200,
        message:'ok',
    });
}