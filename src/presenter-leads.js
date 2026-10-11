import {DateTime} from 'luxon';
export const defaultLeadPolicy={unlock:650,elite:780,baseRate:1350,eliteRate:1500};
function invalid(message){throw Object.assign(new Error(message),{status:400});}
export function leadMonth(value){if(!/^\d{4}-\d{2}$/.test(String(value))||!DateTime.fromISO(value+'-01').isValid)invalid('Elegí un mes válido.');return value;}
export function leadInteger(value,min=0,max=100000){const n=Number(value);if(value===''||value==null||!Number.isSafeInteger(n)||n<min||n>max)invalid('Ingresá una cantidad válida.');return n;}
export function leadPolicy(input){const p={unlock:leadInteger(input.unlock,1),elite:leadInteger(input.elite,1),baseRate:leadInteger(input.baseRate,0,1000000),eliteRate:leadInteger(input.eliteRate,0,1000000)};if(p.elite<p.unlock||p.eliteRate<p.baseRate)invalid('La meta y el importe élite deben ser iguales o superiores al desbloqueo.');return p;}
export function leadPlan(input){const goal=leadInteger(input.goal,1);let offDays=input.offDays;if(offDays==null)offDays=null;else{if(!Array.isArray(offDays))invalid('Elegí dos días de franco.');offDays=[...new Set(offDays.map(d=>leadInteger(d,1,7)))];if(offDays.length!==2)invalid('Elegí exactamente dos días de franco, o dejalos sin configurar.');}return {goal,offDays};}
export function leadSummary({month,today,sourceCount=null,manualCount=0,policy=defaultLeadPolicy,plan={}}){
 leadMonth(month);const total=Number(sourceCount||0)+Number(manualCount);const rate=total>=policy.elite?policy.eliteRate:policy.baseRate;
 const unlocked=total>=policy.unlock;const current=DateTime.fromISO(today),start=DateTime.fromISO(month+'-01'),end=start.endOf('month');
 let calendarDays=0,workingDays=0;const offDays=plan.offDays;
 for(let day=current>start?current:start;day<=end;day=day.plus({days:1})){calendarDays++;if(offDays&&!offDays.includes(day.weekday))workingDays++;}
 if(!offDays)workingDays=Math.ceil(calendarDays*5/7);
 const target=plan.goal||policy.elite,remaining=Math.max(0,target-total);
 return {total,sourceKnown:sourceCount!==null,unlocked,rate,potential:total*rate,earned:unlocked?total*rate:0,
  toUnlock:Math.max(0,policy.unlock-total),toElite:Math.max(0,policy.elite-total),target,remaining,workingDays,estimatedDays:!offDays,
  perDay:remaining===0?0:workingDays>0?Math.ceil(remaining/workingDays):null};
}
