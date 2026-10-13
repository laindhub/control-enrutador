import test from 'node:test';
import assert from 'node:assert/strict';
import {leadSummary,leadPolicy,leadPlan,leadGoalProjection} from '../src/presenter-leads.js';
const summary=(total,extra={})=>leadSummary({month:'2026-10',today:'2026-10-11',sourceCount:total,...extra});
test('commission unlocks retroactively at 650 and all interviews use elite rate at 780',()=>{
 assert.equal(summary(649).earned,0);assert.equal(summary(649).potential,876150);
 assert.equal(summary(650).earned,877500);assert.equal(summary(779).earned,1051650);
 assert.equal(summary(780).earned,1170000);assert.equal(summary(781).earned,1171500);
});
test('external interviews add only the stated difference and missing source is explicit',()=>{
 assert.equal(summary(136,{manualCount:37}).total,173);
 assert.equal(summary(null,{manualCount:37}).sourceKnown,false);
 assert.equal(summary(136,{manualCount:37}).earned,0);
});
test('rotating days off produce estimated work days without fixed weekdays',()=>{
 const s=summary(173,{plan:{goal:650}});
 assert.equal(s.workingDays,15);
 assert.equal(s.perDay,32);
 assert.equal(s.estimatedDays,true);
 assert.deepEqual(leadPlan({goal:650,offDays:[1,2]}),{goal:650});
 assert.equal(leadSummary({month:'2026-10',today:'2026-10-26',sourceCount:0}).workingDays,5);
 assert.equal(leadSummary({month:'2026-11',today:'2026-11-01',sourceCount:0}).workingDays,22);
 assert.equal(leadSummary({month:'2026-09',today:'2026-10-11',sourceCount:173}).perDay,null);
 assert.equal(summary(900).perDay,0);
});
test('policies and goals are validated without requiring fixed off days',()=>{
 assert.throws(()=>leadPolicy({unlock:780,elite:650,baseRate:1350,eliteRate:1500}));
 assert.throws(()=>leadPlan({goal:0}));
 assert.deepEqual(leadPlan({goal:650}),{goal:650});
});

test('personal goal earnings switch rates at unlock and elite thresholds',()=>{
 const examples=[[649,0,'locked'],[650,877500,'unlocked'],[779,1051650,'unlocked'],[780,1170000,'elite'],[900,1350000,'elite']];
 for(const [goal,amount,level] of examples){
  const result=leadGoalProjection(goal);
  assert.equal(result.amount,amount,'goal '+goal);
  assert.equal(result.level,level,'goal '+goal);
  assert.equal(summary(184,{plan:{goal}}).goalProjection.amount,amount);
 }
});
test('personal goal earnings use month-specific configured rates and thresholds',()=>{
 const policy=leadPolicy({unlock:400,elite:500,baseRate:1800,eliteRate:2200});
 assert.deepEqual(leadGoalProjection(399,policy),{target:399,rate:0,amount:0,level:'locked'});
 assert.deepEqual(leadGoalProjection(400,policy),{target:400,rate:1800,amount:720000,level:'unlocked'});
 assert.deepEqual(leadGoalProjection(500,policy),{target:500,rate:2200,amount:1100000,level:'elite'});
 assert.throws(()=>leadGoalProjection(0,policy));
});
