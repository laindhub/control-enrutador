import {DateTime} from 'luxon';
// Zero means Básico has not been configured; legacy months keep their earnings.
export const defaultLeadPolicy={basic:0,basicRate:0,unlock:650,elite:780,baseRate:1350,eliteRate:1500};
export function normalizeLeadPolicy(input=defaultLeadPolicy){return {...defaultLeadPolicy,...input,basic:Number(input?.basic||0),basicRate:Number(input?.basicRate||0)};}
function invalid(message){throw Object.assign(new Error(message),{status:400});}
export function leadMonth(value){if(!/^\d{4}-\d{2}$/.test(String(value))||!DateTime.fromISO(value+'-01').isValid)invalid('Elegí un mes válido.');return value;}
export function leadInteger(value,min=0,max=100000){const n=Number(value);if(value===''||value==null||!Number.isSafeInteger(n)||n<min||n>max)invalid('Ingresá una cantidad válida.');return n;}
export function leadPolicy(input){
 const hasBasic=input.basic!==undefined||input.basicRate!==undefined;
 const p={basic:hasBasic?leadInteger(input.basic,1):0,basicRate:hasBasic?leadInteger(input.basicRate,0,1000000):0,
  unlock:leadInteger(input.unlock,1),elite:leadInteger(input.elite,1),baseRate:leadInteger(input.baseRate,0,1000000),eliteRate:leadInteger(input.eliteRate,0,1000000)};
 if(p.basic>p.unlock||p.unlock>p.elite)invalid('Las metas deben seguir el orden Básico, Desbloqueo y Élite.');
 if(p.basicRate>p.baseRate||p.baseRate>p.eliteRate)invalid('Los valores deben seguir el orden Básico, Desbloqueo y Élite.');
 return p;
}
function leadTier(total,p){
 if(total>=p.elite)return {rate:p.eliteRate,level:'elite'};
 if(total>=p.unlock)return {rate:p.baseRate,level:'unlocked'};
 if(p.basic>0&&total>=p.basic)return {rate:p.basicRate,level:'basic'};
 return {rate:0,level:'locked'};
}
export function leadPlan(input){return {goal:leadInteger(input.goal,1)};}
// The reached tier applies its rate to every interview of the month.
export function leadGoalProjection(goal,policy=defaultLeadPolicy){
 const target=leadInteger(goal,1),{rate,level}=leadTier(target,normalizeLeadPolicy(policy));
 return {target,rate,amount:target*rate,level};
}
export function leadSummary({month,today,sourceCount=null,manualCount=0,policy=defaultLeadPolicy,plan={}}){
 leadMonth(month);policy=normalizeLeadPolicy(policy);
 const total=Number(sourceCount||0)+Number(manualCount),tier=leadTier(total,policy);
 const rate=tier.level==='locked'?(policy.basic>0?policy.basicRate:policy.baseRate):tier.rate;
 const unlocked=total>=policy.unlock;const current=DateTime.fromISO(today),start=DateTime.fromISO(month+'-01'),end=start.endOf('month');
 // Five shifts per week with rotating days off; prorate partial weeks.
 let workingEstimate=0;
 for(let day=current>start?current:start;day<=end;){
  const weekEnd=day.endOf('week').startOf('day'),segmentEnd=weekEnd<end?weekEnd:end;
  const segmentDays=Math.floor(segmentEnd.diff(day,'days').days)+1;
  workingEstimate+=segmentDays*5/7;day=segmentEnd.plus({days:1});
 }
 const workingDays=Math.ceil(workingEstimate);
 const target=plan.goal||policy.elite,remaining=Math.max(0,target-total),goalProjection=leadGoalProjection(target,policy);
 return {total,sourceKnown:sourceCount!==null,unlocked,level:tier.level,rate,potential:total*rate,earned:total*tier.rate,
  toBasic:policy.basic>0?Math.max(0,policy.basic-total):null,
  toUnlock:Math.max(0,policy.unlock-total),toElite:Math.max(0,policy.elite-total),target,goalProjection,remaining,workingDays,estimatedDays:true,
  perDay:remaining===0?0:workingDays>0?Math.ceil(remaining/workingDays):null};
}
