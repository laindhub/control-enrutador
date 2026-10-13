import {DateTime} from 'luxon';
export const defaultLeadPolicy={unlock:650,elite:780,baseRate:1350,eliteRate:1500};
function invalid(message){throw Object.assign(new Error(message),{status:400});}
export function leadMonth(value){if(!/^\d{4}-\d{2}$/.test(String(value))||!DateTime.fromISO(value+'-01').isValid)invalid('Elegí un mes válido.');return value;}
export function leadInteger(value,min=0,max=100000){const n=Number(value);if(value===''||value==null||!Number.isSafeInteger(n)||n<min||n>max)invalid('Ingresá una cantidad válida.');return n;}
export function leadPolicy(input){const p={unlock:leadInteger(input.unlock,1),elite:leadInteger(input.elite,1),baseRate:leadInteger(input.baseRate,0,1000000),eliteRate:leadInteger(input.eliteRate,0,1000000)};if(p.elite<p.unlock||p.eliteRate<p.baseRate)invalid('La meta y el importe élite deben ser iguales o superiores al desbloqueo.');return p;}
export function leadPlan(input){return {goal:leadInteger(input.goal,1)};}
// A monthly goal is a hypothetical final total: the applicable rate affects
// every interview retroactively after meeting the unlock or elite threshold.
export function leadGoalProjection(goal,policy=defaultLeadPolicy){
 const target=leadInteger(goal,1);
 const rate=target>=policy.elite?policy.eliteRate:target>=policy.unlock?policy.baseRate:0;
 return {target,rate,amount:target*rate,
   level:rate===0&&target<policy.unlock?'locked':target>=policy.elite?'elite':'unlocked'};
}
export function leadSummary({month,today,sourceCount=null,manualCount=0,policy=defaultLeadPolicy,plan={}}){
 leadMonth(month);const total=Number(sourceCount||0)+Number(manualCount);const rate=total>=policy.elite?policy.eliteRate:policy.baseRate;
 const unlocked=total>=policy.unlock;const current=DateTime.fromISO(today),start=DateTime.fromISO(month+'-01'),end=start.endOf('month');
 // Rotating days off: five shifts per Monday-Sunday week, without fixed weekdays.
 // A partial week is prorated, including when it continues into another month.
 let calendarDays=0,workingEstimate=0;
 for(let day=current>start?current:start;day<=end;){
  const weekEnd=day.endOf('week').startOf('day');
  const segmentEnd=weekEnd<end?weekEnd:end;
  const segmentDays=Math.floor(segmentEnd.diff(day,'days').days)+1;
  calendarDays+=segmentDays;
  workingEstimate+=segmentDays*5/7;
  day=segmentEnd.plus({days:1});
 }
 const workingDays=Math.ceil(workingEstimate);
 const target=plan.goal||policy.elite,remaining=Math.max(0,target-total),goalProjection=leadGoalProjection(target,policy);
 return {total,sourceKnown:sourceCount!==null,unlocked,rate,potential:total*rate,earned:unlocked?total*rate:0,
  toUnlock:Math.max(0,policy.unlock-total),toElite:Math.max(0,policy.elite-total),target,goalProjection,remaining,workingDays,estimatedDays:true,
  perDay:remaining===0?0:workingDays>0?Math.ceil(remaining/workingDays):null};
}
