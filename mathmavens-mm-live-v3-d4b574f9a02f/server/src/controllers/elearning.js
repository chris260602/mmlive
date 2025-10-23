"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getElearnings = exports.createElearning = void 0;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
// import Elearning from "../db/models/Elearning";
const uuid_1 = require("uuid");
dotenv.config();
const createElearning = async (req, res) => {
    try {
        const token = req.headers.authorization;
        const url = process.env.AUTH_API;
        let userData = null;
        await axios_1.default.get(url, { headers: { 'Authorization': token } }).then((response) => {
            userData = response.data.data;
        }).catch((error) => {
            console.log(error.response.data.message);
            return res.status(500).json({
                status: 500,
                message: error.response.data.message
            });
        });
        if (!userData) {
            return res.status(500).json({
                status: 500,
                message: 'user not found'
            });
        }
        const meetingId = (0, uuid_1.v4)();
        return res.status(201).json({
            status: 201,
            message: 'Created',
            meetingId
        });
    }
    catch (error) {
        if (error != null && error instanceof Error) {
            return res.status(500).json({
                status: 500,
                message: error.message,
                errors: error
            });
        }
        return res.status(500).json({
            status: 500,
            message: 'Internal server error',
            errors: error
        });
    }
};
exports.createElearning = createElearning;
const getElearnings = async (_req, res) => {
    return res.status(200).json({
        status: 200,
        message: 'ok',
    });
};
exports.getElearnings = getElearnings;
//# sourceMappingURL=elearning.js.map