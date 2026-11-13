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
export function leadPlan(input,month){
 const plan={goal:leadInteger(input.goal,1)};
 if(input.offDates===undefined)return plan;
 if(input.offDates===null)return {...plan,offDates:null};
 leadMonth(month);
 if(!Array.isArray(input.offDates)||input.offDates.length>31||
    input.offDates.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
      !date.startsWith(month+'-')||!DateTime.fromISO(date).isValid))
  invalid('Elegí fechas de franco válidas del mes seleccionado.');
 return {...plan,offDates:[...new Set(input.offDates)].sort()};
}
// The reached tier applies its rate to every interview of the month.
export function leadGoalProjection(goal,policy=defaultLeadPolicy){
 const target=leadInteger(goal,1),{rate,level}=leadTier(target,normalizeLeadPolicy(policy));
 return {target,rate,amount:target*rate,level};
}
export function leadSummary({month,today,sourceCount=null,manualCount=0,policy=defaultLeadPolicy,plan={}}){
 leadMonth(month);policy=normalizeLeadPolicy(policy);
 const total=Math.max(0,Number(sourceCount||0)+Number(manualCount)),tier=leadTier(total,policy);
 const rate=tier.level==='locked'?(policy.basic>0?policy.basicRate:policy.baseRate):tier.rate;
 const unlocked=total>=policy.unlock;const current=DateTime.fromISO(today),start=DateTime.fromISO(month+'-01'),end=start.endOf('month');
 const estimatedDays=!Array.isArray(plan.offDates);
 const offDates=new Set(estimatedDays?[]:plan.offDates);
 let remainingDays=0;
 for(let day=current>start?current:start;day<=end;day=day.plus({days:1})){
  if(!offDates.has(day.toISODate()))remainingDays++;
 }
 const workingDays=estimatedDays?Math.ceil(remainingDays*5/7):remainingDays;
 const target=plan.goal||policy.elite,remaining=Math.max(0,target-total),goalProjection=leadGoalProjection(target,policy);
 return {total,sourceKnown:sourceCount!==null,unlocked,level:tier.level,rate,potential:total*rate,earned:total*tier.rate,
  toBasic:policy.basic>0?Math.max(0,policy.basic-total):null,
  toUnlock:Math.max(0,policy.unlock-total),toElite:Math.max(0,policy.elite-total),target,goalProjection,remaining,workingDays,estimatedDays,monthEnded:current>end,
  perDay:remaining===0?0:workingDays>0?Math.ceil(remaining/workingDays):null};
}
