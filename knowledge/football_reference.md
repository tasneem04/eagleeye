# EagleEye Football Reference: worked game-reading situations

The EagleEye team wrote this companion to `coaching_principles.md` for youth players aged 10 to 16, in our own words. Every situation is invented; players are known only by shirt number and role. Use a situation when it looks like the current moment, but the geometry facts in code (`code style` names) always win, and `coaching_principles.md` wins if the two disagree.

Each situation follows the same order: **Situation** (what the picture looks like), **Scan** (what to look at before the ball arrives), **Best decision**, **Why**, and **Common mistake**.

---

## A. Scanning focus by position

| Role | Look at first | Look at second | The question to answer before receiving |
|---|---|---|---|
| Goalkeeper | Which defender is free (`open_teammates`) | Where the opponent's forwards are pressing from | "Short, or over the press?" |
| Centre back | The forward pressing him and the free midfielder | The far-side centre back and full back (switch) | "Can I step in with the ball, or pass into midfield?" |
| Full back / wing back | The winger in front and the space down the line | The midfielder inside him (the inside pass) | "Down the line, inside, or back?" |
| Defensive midfielder | The opponent behind him (is he free to turn?) | Both centre backs and the far side | "Can I turn, or do I set it back?" |
| Central midfielder | Both shoulders: pressure from behind and the gap between the lines | The far side (`switch_options`) | "Turn and play forward, or play one-two and move?" |
| Attacking midfielder | The defender behind him and the striker's run | The space either side of the defensive midfielder | "Turn, slip the runner in, or shoot?" |
| Winger / wide midfielder | His full back and the space behind the opponent's full back | Runners arriving in the box | "Go 1v1, cut inside, or wait for the overlap?" |
| Striker | The last defender (offside line) and the gap between centre backs | The midfielder who can pass to him | "Run behind, or come short and set?" |

Central defenders and central midfielders need the most scans, because the ball and the pressure can come from every side. Wide players can use the touchline as a "wall" behind them and scan mostly infield.

---

## B. Build-up situations (defensive third)

### B1. Centre back with time, forward pressing slowly
- **Situation:** #4 has the ball in the defensive third, central channel. `pressure.level` low (nearest opponent 9 m). #6 is open 12 m ahead with `forward_m` positive.
- **Scan:** Where is the opponent's forward running from? Is #6 facing forward or with his back to goal? Who is behind #6?
- **Best decision:** Pass to #6 if his `receiver_space_m` is over 4 m and the lane is open; otherwise carry forward a few metres to draw the forward, then pass.
- **Why:** A centre back with time can break the first line. Carrying the ball makes an opponent step out and frees a teammate.
- **Common mistake:** Passing sideways to the other centre back by habit when a forward pass was open.

### B2. Full back pressed against the touchline
- **Situation:** #2 receives on the right wing in his defensive third. An opponent is 2.5 m away (`pressure.level` high), a second opponent 5 m inside.
- **Scan:** Before the ball arrives: is the pass down the line on? Is the centre back behind still open?
- **Best decision:** One touch back to the open centre back or goalkeeper (keep mode). If the ball down the line is open to a winger with space, play it first time.
- **Why:** The touchline cuts his escape routes in half; two opponents within 6 m is a trap. Speed beats the trap.
- **Common mistake:** Trying to dribble past both opponents near his own box.

### B3. Goalkeeper with the ball, opponents pressing high
- **Situation:** The goalkeeper has the ball. Two opponents press the two centre backs. A midfielder (#8) is open in the central channel with 6 m of space, but the lane is long (about 30 m).
- **Scan:** Count: how many opponents press, how many of us are there? Is the lane to #8 open?
- **Best decision:** If #8's lane is open, the firm ground pass to #8 breaks the press. If not, the long pass to the side where a teammate has space.
- **Why:** If they press with fewer players than we have, someone is always free. Finding him beats the whole press.
- **Common mistake:** Passing to a centre back who has an opponent 2 m away, inviting a loss in front of goal.

### B4. Defensive midfielder with an opponent right behind him
- **Situation:** #6 receives from the centre back. An opponent is 1.5 m behind him (`pressure.level` high). Full back #3 is open to the side.
- **Scan:** Over the shoulder before the pass: who is behind me, and from which side?
- **Best decision:** Set the ball first time to #3 or back to the centre back (keep mode), then move into a new space.
- **Why:** Turning into a tight opponent loses the ball in the most dangerous zone of the pitch, the central channel of your own half.
- **Common mistake:** Not scanning, turning blind and being tackled.

### B5. Defensive midfielder with space behind him
- **Situation:** Same as B4, but the nearest opponent is 8 m away (`pressure.level` low) and there is space ahead.
- **Scan:** The shoulder scan shows nobody close.
- **Best decision:** Receive on the half-turn, back foot, and face forward. Look for the line-breaking pass or a carry.
- **Why:** Turning opens every forward option. The scan told him he had time.
- **Common mistake:** Playing back first time out of habit, wasting a chance to progress.

### B6. Leading late, opponent pressing hard
- **Situation:** 85th minute, the team leads 1-0. #5 has the ball in his own third; forward lanes are blocked.
- **Scan:** Where is the safest open teammate (`receiver_space_m` biggest)?
- **Best decision:** Keep mode: the safe pass or back to the goalkeeper; if nothing is open, a long ball into the opponent's half toward the touchline.
- **Why:** A loss here costs the lead. Making the opponent chase uses up time.
- **Common mistake:** A risky pass through the middle of his own half.

---

## C. Progression situations (middle third)

### C1. Midfielder between the lines
- **Situation:** #10 is in the right half-space between the opponent's midfield and defence, 7 m from his nearest opponent, facing sideways. #8 has the ball and an open lane to him.
- **Scan:** #10 checks his left shoulder (is the centre back stepping out?) and right shoulder (the full back).
- **Best decision:** #8 plays the firm ground pass into #10's far foot; #10 turns and faces goal.
- **Why:** One pass removes the whole midfield line. A receiver with over 4 m of space who faces forward is the most valuable pass in this third.
- **Common mistake:** #8 playing safe to the full back because the pass into #10 "looks risky", when the lane is open.

### C2. Forward lane blocked: third man
- **Situation:** #6 wants to reach #9, who is forward with space, but an opponent blocks the lane. `third_man` lists [#6, #8, #9].
- **Scan:** #6 sees that #8 is open and can see #9. #9 watches #6's head: when it goes down to pass to #8, #9 starts his run.
- **Best decision:** Pass to #8 (the link), who plays first time to #9.
- **Why:** The defender blocking the lane watches the ball going to #8 and loses #9.
- **Common mistake:** Forcing the blocked pass straight to #9, or #9 running too early and being marked again.

### C3. One side crowded: switch
- **Situation:** Six opponents have moved to the left. #3 has the ball on the left; `switch_options` lists #7, open 35 m across on the right wing.
- **Scan:** The far-shoulder look before receiving.
- **Best decision:** Switch quickly to #7, or through a central player in two passes. #7 attacks his full back at once.
- **Why:** The far side is open, but only for a few seconds before the defence slides.
- **Common mistake:** One more pass on the crowded side "to be safe", so the window closes.

### C4. Nobody open ahead, space in front
- **Situation:** #8 in the middle third, central channel. No forward teammate is open, but `free_space.space_m` is 11 m ahead and `pressure.level` is low.
- **Scan:** Is the carry line clear? Which defender will have to step out?
- **Best decision:** Carry into the free space; when a defender steps out to meet him, pass to the teammate he left.
- **Why:** A carry gains ground and moves defenders, creating the next pass.
- **Common mistake:** Standing still with the ball waiting for someone to get free.

### C5. Wide midfielder, full back overlapping
- **Situation:** #11 on the left wing in the middle third faces an opponent 4 m away. Full back #3 runs past him on the outside.
- **Scan:** Does the defender turn to follow #3, or stay with #11?
- **Best decision:** If the defender follows #3, cut inside into the space; if he stays, pass down the line to #3.
- **Why:** The overlap is a 2v1: the defender cannot stop both.
- **Common mistake:** Passing too early, before the defender has chosen.

### C6. Square pass that goes nowhere
- **Situation:** #4 and #5 have passed sideways four times; the opponent has not moved.
- **Scan:** Who is free forward? Is a third-man pattern possible?
- **Best decision:** Change the rhythm: a carry forward, a pass into midfield, or a switch.
- **Why:** Sideways passes only help if they move the opponent.
- **Common mistake:** Waiting for the opponent to make a mistake that never comes.

---

## D. Chance creation situations (attacking third)

### D1. Winger near the byline: cutback
- **Situation:** #7 reaches the byline on the right, 8 m wide of the goal. `shot.angle_deg` is under 15. #9 arrives near the penalty spot with a clear lane between them.
- **Scan:** Before reaching the byline, a look at the area between the six-yard box and the penalty spot.
- **Best decision:** Low, firm cutback to #9 for a first-time shot.
- **Why:** From the byline the goalkeeper covers the near post; a central shot from 10 to 12 m is worth several times more.
- **Common mistake:** Shooting from the tight angle, or lifting the ball over everyone.

### D2. Attacking midfielder 18 m out, lane blocked
- **Situation:** #10 is 18 m from goal, central. `shot.lane_clear` is false (one blocker). #9 is open on the edge of the six-yard box with 5 m of space.
- **Scan:** Where is #9 and is the lane to him open?
- **Best decision:** Pass to #9 if he is open; a blocked 18 m shot is worth only about 0.06 in EagleEye's estimate.
- **Why:** A blocked lane cuts the chance to well under half.
- **Common mistake:** Shooting into the blocker because the goal is close.

### D3. Striker 1v1 with the last defender
- **Situation:** #9 receives in the central channel 25 m from goal, one defender ahead, no cover behind, `free_space.space_m` 9 m.
- **Scan:** Is there a covering defender? Where are teammates arriving?
- **Best decision:** Dribble at the defender's front foot at speed, then shoot when the lane is clear inside about 18 m.
- **Why:** Isolated 1v1 in the attacking third is worth the risk; losing the ball here is cheap.
- **Common mistake:** Slowing down and letting the defence recover.

### D4. Through ball timing
- **Situation:** #8 has the ball in the middle third; #9 is level with the last defender on the left of the central channel and starts to bend his run.
- **Scan:** #8 checks that #9 is onside and the lane behind the defence is open.
- **Best decision:** Play the pass into the space in front of #9's run, not to his feet.
- **Why:** A pass behind the defence takes many defenders out at once.
- **Common mistake:** Waiting one touch too long, so #9 is offside or the defender reads it.

### D5. Edge of the box, clear lane
- **Situation:** #10 is 16 m out, central, `shot.lane_clear` true, `pressure.level` medium.
- **Scan:** Last look: where is the goalkeeper standing? Is anyone better placed?
- **Best decision:** Shoot early, low to the corner.
- **Why:** A clear central shot from 16 m is a fair chance (about 0.17 in EagleEye's estimate), and pressure is closing.
- **Common mistake:** One more touch, and the lane closes.

### D6. Crowded box, nobody free
- **Situation:** #11 is in the attacking third, left half-space. Eight opponents are in the box. No open teammate inside; #3 is open behind him.
- **Scan:** Is there a gap? Is the far side open?
- **Best decision:** Keep the ball with a pass back to #3 and switch, or wait for runners.
- **Why:** Even in the attacking third, a pass into a crowd usually loses the ball and starts a counter-attack.
- **Common mistake:** A hopeful pass into the box.

---

## E. Finishing situations

### E1. Close and central
- **Situation:** #9 receives 7 m out, central, clear lane.
- **Scan:** None needed now: the picture is already made.
- **Best decision:** Shoot first time, placed, low.
- **Why:** This is a big chance (over 0.5 in EagleEye's estimate). Every extra touch lets defenders block.
- **Common mistake:** Trying to dribble round the goalkeeper when the shot is on.

### E2. Tight angle, teammate free in the middle
- **Situation:** #7 is 6 m from the goal line, 10 m wide. #9 is free in the middle 8 m out.
- **Scan:** A look across the box before the shot.
- **Best decision:** Square pass to #9.
- **Why:** From the wide spot the angle is only about 20 degrees (about 0.18); #9's central chance is worth much more.
- **Common mistake:** Shooting because "I'm close to goal".

### E3. Rebound
- **Situation:** A shot from #10 is saved and the ball drops loose near the six-yard box.
- **Scan:** Strikers follow every shot; look for where the ball can drop.
- **Best decision:** Attack the rebound first time.
- **Why:** Loose balls near goal are often among the best chances, and the goalkeeper is out of position.
- **Common mistake:** Watching the shot and standing still.

---

## F. Transition situations

### F1. Ball won in midfield, opponents spread
- **Situation:** #6 wins the ball in the middle third. Four opponents are still in our half; #9 is open ahead with space.
- **Scan:** The first look is forward.
- **Best decision:** Pass forward to #9 at once, or carry if the lane is closed (progress mode).
- **Why:** Most counter-attack goals take only a few seconds and two or three passes; the opponent is not organised yet.
- **Common mistake:** A safety pass sideways, giving the opponent time to recover.

### F2. Ball won, but surrounded
- **Situation:** #8 wins the ball with three opponents within 6 m and no forward option.
- **Scan:** Where is the nearest open teammate away from the crowd?
- **Best decision:** A safe pass out of the crowded area, then build again (keep).
- **Why:** The opponents nearby will counter-press; moving the ball out of the zone beats it.
- **Common mistake:** Dribbling into the counter-press and losing the ball again.

### F3. Ball lost in the attacking third
- **Situation:** #10 loses the ball 25 m from the opponent's goal.
- **Scan:** Who is the nearest opponent's easiest pass?
- **Best decision:** #10 presses at once; the next teammates block the closest passing lanes for about five seconds.
- **Why:** The opponent who just won the ball has not looked up yet, and his team is not spread out.
- **Common mistake:** Stopping to complain, letting the opponent play forward.

### F4. Ball lost and the press fails
- **Situation:** After five seconds the opponent is still on the ball and plays forward.
- **Scan:** Where is the danger: the middle or a runner behind?
- **Best decision:** Sprint back toward your own goal, get compact, push the attack wide.
- **Why:** A late, scattered press leaves gaps; a compact team is hard to pass through.
- **Common mistake:** Pressing alone and leaving a gap behind.

---

## G. Off-the-ball situations (team has the ball)

### G1. Hidden behind a defender
- **Situation:** #8 stands directly behind an opponent from the ball carrier's view; `space_value.best_position` says "3 m to the left", `available_here` false.
- **Scan:** Can the passer see me? Where is the gap?
- **Best decision:** Move the few metres given in `direction_text` to get free.
- **Why:** The ball cannot reach you in a defender's shadow.
- **Common mistake:** Calling for the ball while standing in the shadow.

### G2. Already free, more dangerous space ahead
- **Situation:** #10 is open, but `best_position` shows a spot 8 m ahead-right in the right half-space with a large gain.
- **Scan:** Can I arrive there before the nearest defender?
- **Best decision:** Make the run described by `direction_text`, timed when the passer's head is up.
- **Why:** The spot is more dangerous and still reachable for the pass.
- **Common mistake:** Running while the passer is under pressure and looking down.

### G3. Striker pinning the defence
- **Situation:** #9 is level with the last defender; midfielders are struggling to find space.
- **Scan:** Where are the centre backs looking?
- **Best decision:** Threaten a run behind, so the defence drops and space opens between the lines for #10.
- **Why:** A run can create space for a teammate even if the pass never comes.
- **Common mistake:** Coming short with everyone else, so the opponent can push up.

---

## H. Glossary in plain words

- **Scan:** a quick look away from the ball to see the pitch.
- **Half-turn / open body:** standing side-on so you see the ball and the pitch ahead.
- **Back foot:** the foot further from the passer; receiving on it lets you face forward.
- **Pressure:** how close the nearest opponent is (high under 3 m, medium 3 to 6 m, low over 6 m).
- **Passing lane:** the path of a pass. It is blocked if an opponent is close enough to the line to cut it out.
- **Cover shadow:** the area behind a defender where a pass cannot reach.
- **Open teammate:** a teammate with a clear lane and at least 4 m of space.
- **Line-breaking pass:** a pass past a line of opponents to a teammate who can face forward.
- **Between the lines:** the space between the opponent's midfield and defence.
- **Half-space:** the gap between the wing and the middle.
- **Third man:** a pass to a link player who passes on to a runner you could not reach directly.
- **Switch of play:** a pass of 25 m or more across the pitch to the far side.
- **Overlap / underlap:** a teammate running past the ball carrier on the outside / inside.
- **Overload:** more of our players than theirs near the ball (2v1, 3v2).
- **Cutback:** a low pass back from near the byline to a player arriving in front of goal.
- **xG (expected goals):** the chance a shot becomes a goal, from 0 (no chance) to 1 (certain).
- **Space value:** how dangerous a spot is, times how likely our team is to win it.
- **Counter-press:** pressing right after losing the ball, for about five seconds.
- **Rest defence:** players who stay behind the ball while the team attacks.
- **Pressing trigger:** a moment when the whole team presses together (backward pass, bad touch, receiver facing his own goal, pass to the touchline).
- **Pressure, cover, balance:** first defender presses, second covers behind, others protect the middle and far side.
- **Fix the defender:** dribble at a defender so he must choose, then pass or go past.

---

## I. Researched notes (KnowledgeScout)

Added by the KnowledgeScout agent after code checks (and, in review mode, human approval). Written in our own words; no real players, clubs or competitions. If anything here disagrees with sections A-H or with coaching_principles.md, those win.

<!-- scout:start -->
_No researched notes yet._
<!-- scout:end -->
