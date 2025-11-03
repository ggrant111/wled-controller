/**
 * Test to verify wall bounce behavior for skipping rock effect
 * Simulates the exact logic from skippingRock.ts to diagnose bounce issues
 */

// Simulate exact parameters from the code
const N = 100; // LED count
const elasticity = 0.78;
const desiredSpeed = 180;
const dt = 0.05; // 50ms per frame (20 FPS)

// Initial state - start moving right
let rockX = 95; // Start near right wall
let rockV = 180; // Moving right (positive)
let frameCount = 0;
let bounceCount = 0;
let lastBounceFrame = -1;

console.log('=== Wall Bounce Test ===\n');
console.log(`LED Count (N): ${N}`);
console.log(`Elasticity: ${elasticity}`);
console.log(`Desired Speed: ${desiredSpeed} px/s`);
console.log(`Initial: pos=${rockX.toFixed(2)}, vel=${rockV.toFixed(2)} (moving right)\n`);

// Track bounce history
const bounceHistory = [];

// Simulate 200 frames
for (let i = 0; i < 200; i++) {
  frameCount++;
  
  // Move rock (exact logic from code)
  const oldX = rockX;
  const oldV = rockV;
  rockX += rockV * dt;
  
  // Check wall hits (exact logic from code)
  const wallHitLeft = rockX < 0;
  const wallHitRight = rockX >= N;
  
  let bounced = false;
  if (wallHitLeft || wallHitRight) {
    bounced = true;
    bounceCount++;
    lastBounceFrame = frameCount;
    
    // Exact bounce logic from skippingRock.ts
    if (wallHitLeft) {
      // Hit left wall - bounce right
      const overshoot = -rockX; // Positive value
      rockX = Math.max(0, Math.min(N - 1, overshoot));
      rockV = Math.abs(rockV) * elasticity; // Positive velocity (moving right)
      
      bounceHistory.push({
        frame: frameCount,
        wall: 'LEFT',
        oldX: oldX,
        newX: rockX,
        oldV: oldV,
        newV: rockV,
        overshoot: overshoot
      });
    } else {
      // Hit right wall - bounce left
      const overshoot = rockX - (N - 1); // Positive value
      rockX = Math.max(0, Math.min(N - 1, (N - 1) - overshoot));
      rockV = -Math.abs(rockV) * elasticity; // Negative velocity (moving left)
      
      bounceHistory.push({
        frame: frameCount,
        wall: 'RIGHT',
        oldX: oldX,
        newX: rockX,
        oldV: oldV,
        newV: rockV,
        overshoot: overshoot
      });
    }
    
    // Minimum velocity check
    const minVel = Math.max(30, desiredSpeed * 0.2);
    if (Math.abs(rockV) < minVel) {
      rockV = (rockV >= 0 ? 1 : -1) * minVel;
    }
    
    const maxVelLoss = desiredSpeed * 0.15;
    if (Math.abs(rockV) < maxVelLoss) {
      rockV = (rockV >= 0 ? 1 : -1) * maxVelLoss;
    }
    
    // Final clamp
    rockX = Math.max(0, Math.min(N - 1, rockX));
    
    console.log(`\n🔴 BOUNCE #${bounceCount} at frame ${frameCount}:`);
    console.log(`   Hit: ${wallHitLeft ? 'LEFT' : 'RIGHT'} wall`);
    console.log(`   Position: ${oldX.toFixed(2)} -> ${rockX.toFixed(2)}`);
    console.log(`   Velocity: ${oldV.toFixed(2)} -> ${rockV.toFixed(2)} px/s`);
    console.log(`   Overshoot: ${wallHitLeft ? -oldX : oldX - (N-1)}`);
    console.log(`   Direction: ${rockV >= 0 ? 'RIGHT ➡️' : 'LEFT ⬅️'}`);
  } else {
    // No bounce - just clamp position
    rockX = Math.max(0, Math.min(N - 1, rockX));
    
    // Velocity restoration (only if didn't bounce)
    const dir = rockV >= 0 ? 1 : -1;
    const currentSpeed = Math.abs(rockV);
    if (currentSpeed < desiredSpeed * 0.95) {
      const restoreRate = 0.12;
      const targetSpeed = desiredSpeed;
      const newSpeed = currentSpeed + (targetSpeed - currentSpeed) * restoreRate;
      rockV = dir * Math.min(desiredSpeed, newSpeed);
    }
  }
  
  // Safety check
  if (Math.abs(rockV) < 1 || Math.abs(rockV) < desiredSpeed * 0.1) {
    const dir = rockV >= 0 ? 1 : -1;
    rockV = dir * Math.max(desiredSpeed * 0.3, 30);
    console.log(`   ⚠️  Velocity too low, reset to ${rockV.toFixed(2)}`);
  }
  
  // Log every 20 frames or near walls
  if (i % 20 === 0 || rockX < 5 || rockX > N - 5) {
    const dir = rockV >= 0 ? '➡️' : '⬅️';
    console.log(`Frame ${frameCount}: pos=${rockX.toFixed(2)} ${dir} vel=${rockV.toFixed(2)}`);
  }
  
  // Check if stuck
  if (Math.abs(rockV) < 5 && frameCount > 10) {
    console.log(`\n⚠️  ROCK STUCK at frame ${frameCount}:`);
    console.log(`   Position: ${rockX.toFixed(2)}`);
    console.log(`   Velocity: ${rockV.toFixed(2)}`);
    console.log(`   Last bounce: frame ${lastBounceFrame}`);
    break;
  }
  
  // Check if out of bounds
  if (rockX < -1 || rockX > N + 1) {
    console.log(`\n❌ ROCK OUT OF BOUNDS at frame ${frameCount}:`);
    console.log(`   Position: ${rockX.toFixed(2)} (should be 0-${N-1})`);
    console.log(`   Velocity: ${rockV.toFixed(2)}`);
    break;
  }
}

console.log(`\n=== Test Results ===`);
console.log(`Total frames: ${frameCount}`);
console.log(`Total bounces: ${bounceCount}`);
console.log(`Final position: ${rockX.toFixed(2)}`);
console.log(`Final velocity: ${rockV.toFixed(2)} px/s`);
console.log(`Direction: ${rockV >= 0 ? 'RIGHT ➡️' : 'LEFT ⬅️'}`);

if (bounceCount === 0) {
  console.log(`\n❌ ERROR: No bounces detected! Rock should have bounced at least once.`);
  console.log(`   Check: wall hit detection logic may be broken.`);
} else if (bounceCount < 2) {
  console.log(`\n⚠️  WARNING: Only ${bounceCount} bounce(s) detected. Should have multiple bounces.`);
} else {
  console.log(`\n✅ SUCCESS: ${bounceCount} bounces detected. Rock is bouncing correctly.`);
}

console.log(`\n=== Bounce History ===`);
bounceHistory.forEach((b, idx) => {
  console.log(`Bounce ${idx + 1}: Frame ${b.frame}, ${b.wall} wall`);
  console.log(`  ${b.oldX.toFixed(2)} -> ${b.newX.toFixed(2)}`);
  console.log(`  Velocity: ${b.oldV.toFixed(2)} -> ${b.newV.toFixed(2)}`);
  console.log(`  Overshoot: ${b.overshoot.toFixed(2)}`);
});

// Check for bounce pattern issues
if (bounceHistory.length >= 2) {
  console.log(`\n=== Bounce Pattern Analysis ===`);
  let allRight = true;
  let allLeft = true;
  for (const b of bounceHistory) {
    if (b.wall !== 'RIGHT') allRight = false;
    if (b.wall !== 'LEFT') allLeft = false;
  }
  
  if (allRight || allLeft) {
    console.log(`❌ ERROR: All bounces on same wall!`);
    console.log(`   This indicates the rock is not reversing direction properly.`);
  } else {
    console.log(`✅ Bounces alternate between walls correctly.`);
  }
}

