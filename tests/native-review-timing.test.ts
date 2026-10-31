import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeReviewExpiry} from '../agent-registration/native-investment.js';
test('slow completed native simulation leaves a full thirty-second opening window',()=>{
 assert.equal(nativeReviewExpiry(1000000,2000,1760,1029000),1059000);
 assert.equal(nativeReviewExpiry(1000000,2000,1800,1060000),1090000);
});
test('native review never extends its chain deadline or accepts a stalled simulation',()=>{
 assert.throws(()=>nativeReviewExpiry(1000000,2000,1941,1029000),/deadline is too close/);
 assert.throws(()=>nativeReviewExpiry(1000000,2000,1700,1090000),/Simulation took too long/);
 assert.throws(()=>nativeReviewExpiry(1000000,2000,1700,999999),/Simulation took too long/);
 assert.equal(nativeReviewExpiry(1000000,2000,1940,1000001),1030001);
});
