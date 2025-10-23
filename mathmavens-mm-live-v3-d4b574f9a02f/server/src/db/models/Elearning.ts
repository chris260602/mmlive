import { DataTypes, Model, Optional } from "sequelize";
import connection from "../../config/dbConnect";

interface ElearningAttributes {
    id?:number,
    meetingId?:string,
    title?:string,
    status?:string,
    class?:string,

    created_at?: Date,
    updated_at?: Date,
    deleted_at?: Date | null,
    created_by?: number,
    updated_by?: number,
    deleted_by?: number
}

export interface ElearningInput extends Optional<ElearningAttributes, 'id'>{ }
export interface ElearningOutput extends Required<ElearningAttributes> {}



class Elearning extends Model<ElearningAttributes, ElearningInput> implements ElearningAttributes {
    public id!:number;
    public meetingId!: string;
    public title!:string;
    public status!:string;
    public class!:string;

    public readonly createdAt!: Date
    public readonly updatedAt!: Date
    public readonly deletedAt!: Date
    public createdBy!: number
    public updatedBy!: number
    public deletedBy!: number
}


Elearning.init({
    id:{
        allowNull:false,
        autoIncrement: true,
        primaryKey:true,
        type: DataTypes.BIGINT
    },
    meetingId:{
        allowNull:false,
        type: DataTypes.STRING
    },
    title:{
        allowNull:false,
        type: DataTypes.STRING
    },
    status:{
        allowNull:false,
        type: DataTypes.STRING
    },
    class:{
        allowNull:false,
        type: DataTypes.STRING
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
    underscored:true,
    tableName: 'elearning'
})

export default Elearning;