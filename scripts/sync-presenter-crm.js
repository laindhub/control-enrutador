import {syncOnePresenter} from '../src/presenter-crm-worker.js';
import {pool} from '../src/db.js';
try{
 const result=await syncOnePresenter();
 if(process.send)process.send({crmSync:true,...result});
}catch{
 if(process.send)process.send({crmSync:true,ok:false,status:'error'});
 process.exitCode=1;
}finally{
 await pool.end();
 if(process.connected)process.disconnect();
}
