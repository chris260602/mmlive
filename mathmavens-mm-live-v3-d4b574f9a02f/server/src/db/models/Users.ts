import { DataTypes, Model, Optional } from "sequelize";
import connection from "../../config/dbConnect";

interface UsersAttributes {
    id?:number,
    channel_id?:string,
    user_id?:number,
    participants?:number,

    created_at?: Date,
    updated_at?: Date,
    deleted_at?: Date | null,
    created_by?: number,
    updated_by?: number,
    deleted_by?: number
}

export interface UsersInput extends Optional<UsersAttributes, 'id'>{ }
export interface UsersOutput extends Required<UsersAttributes> {}



class Conversations extends Model<UsersAttributes, UsersInput> implements UsersAttributes {
    public id!:number;
    public channeld!:string;
    public userId!:number;
    public participants!:number;

    public readonly createdAt!: Date
    public readonly updatedAt!: Date
    public readonly deletedAt!: Date
    public createdBy!: number
    public updatedBy!: number
    public deletedBy!: number
}

Conversations.init({
    id:{
        allowNull:false,
        autoIncrement: true,
        primaryKey:true,
        type: DataTypes.BIGINT
    },
    channel_id:{
        allowNull:false,
        type: DataTypes.STRING
    },
    user_id:{
        allowNull:false,
        type: DataTypes.NUMBER
    },
    participants:{
        allowNull:false,
        type: DataTypes.NUMBER
    },
    created_at:{
        allowNull:true,
        type: DataTypes.DATE
    },
    created_by:{
        allowNull:true,
        type: DataTypes.NUMBER
    },
    updated_at:{
        allowNull:true,
        type: DataTypes.DATE
    },
    updated_by:{
        allowNull:true,
        type: DataTypes.NUMBER
    },
    deleted_at:{
        allowNull:true,
        type: DataTypes.DATE
    },
    deleted_by:{
        allowNull:true,
        type: DataTypes.NUMBER
    }
},{
    timestamps:true,
    sequelize:connection,
    underscored:true
})

export default Conversations;