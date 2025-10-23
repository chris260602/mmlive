import { USER_DATA_TYPE } from "./user";


type PRODUCER_DATA_TYPE = {
    producerId:string;
    userData:USER_DATA_TYPE
    kind:string;
}

export type JOIN_ROOM_RESPONSE_TYPE = {
  rtpCapabilities: any;
  producersData: PRODUCER_DATA_TYPE[];
  isReconnection: boolean;
  error?:string;
};
