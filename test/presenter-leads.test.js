import test from 'node:test';
import assert from 'node:assert/strict';
import {leadSummary,leadPolicy,leadPlan} from '../src/presenter-leads.js';
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
test('working days include today if working and respect two off days, no divide by zero',()=>{
 const s=summary(173,{plan:{goal:650,offDays:[1,2]}});
 assert.equal(s.workingDays,15);assert.equal(s.perDay,32);
 assert.equal(summary(173).estimatedDays,true);
 assert.equal(leadSummary({month:'2026-09',today:'2026-10-11',sourceCount:173}).perDay,null);
 assert.equal(summary(900).perDay,0);
});
test('policies and schedule reject invalid tiers and off days',()=>{
 assert.throws(()=>leadPolicy({unlock:780,elite:650,baseRate:1350,eliteRate:1500,bonus:100000,walkInPercent:60}));
 assert.throws(()=>leadPlan({goal:650,offDays:[1,1]}));
 assert.deepEqual(leadPlan({goal:650,offDays:null}),{goal:650,offDays:null});
});
