# EagleEye Coaching Principles

The EagleEye team wrote this original guide for youth players aged 10 to 16, in our own words. EagleEye's agents read it through File Search to judge the phase of play, risk, keep-or-progress mode and the best action. Names in `code style` are the geometry facts that EagleEye calculates in code; each rule says which fact to check.

**How to use this guide.** The geometry facts are verified and always win. Use these principles to explain *why* a fact matters, never to invent a player, a gap or a run that the facts do not show. All distances are metres on a 105 x 68 m pitch. All numbers below are rules of thumb for young players, not laws.

**Companion file.** `football_reference.md` holds worked game-reading situations (situation, what to scan, best decision, why, common mistake) by phase, zone and position, plus a glossary. Use it to find a moment that looks like the current one. This guide wins if the two ever disagree.

---

## 1. Scanning: see before you receive

### 1.1 What and why
- A **scan** is a quick turn of the head away from the ball to collect information, then back to the ball. It takes well under a second.
- Studies of professional players found that they scan about three times in the ten seconds before they receive, and that more scanning goes with more completed passes, more turns and more forward passes. The effect is small but real, and scanning is a habit that can be trained.
- Players scan less when an opponent is already tight, so the best moment to scan is **before** the pressure arrives.
- Scanning grows with age and experience: older youth players scan more than younger ones, and central defenders and central midfielders scan the most, because the ball can arrive from any side.
- A scan is only useful if it changes the next action. "I looked" is step one; "I looked, so I took my first touch away from #6" is the goal.

### 1.2 When to scan (the scan clock)
- **While the ball travels between two teammates:** the safest time, because nothing can reach you yet.
- **Just before the pass to you is played:** the last picture, which decides your first touch. Elite youth players take their last look roughly one and a half to two seconds before the ball arrives; a later last look goes with receiving already facing forward.
- **After you pass:** see what changed and where to move next.
- **Off the ball, all the time:** about one look every two seconds keeps your picture fresh.
- Do not look away while the ball is arriving. Last look, then eyes on the ball.

### 1.3 Scan targets by level (EagleEye training mode)
EagleEye expects a number of scans in the time before the ball arrives (the scan window), by level:

| Level | Scans per second expected | In a 3 s window | In a 5 s window | Decision clock on the ball |
|---|---|---|---|---|
| Rookie (grassroots) | about 0.25 | 1 | 1 | none |
| Academy (youth elite) | about 0.45 | 1 | 2 | 3 s |
| Pro (elite) | about 0.7 | 2 | 4 | 1.5 s |

- Taking longer than the decision clock lowers the grade one step (best to good, good to ok, ok to risky): at higher levels the defender closes you down.
- Quality beats quantity: one well-timed look at the right shoulder is worth more than three looks at nothing.

### 1.4 What a scan can actually see
- The eyes see detail only in the middle of the view. EagleEye uses three vision zones, measured from where the eyes point:
  - within about **30 degrees**: you can identify a player (team and shirt number);
  - within about **60 degrees**: you can tell the shirt colour, but not the number;
  - within about **100 degrees**: you only notice that something is there.
- A player only noticed out of the corner of the eye counts half. To be sure who is free, point the eyes at him.
- With the body facing the ball, the head and eyes reach about 120 degrees to each side. Anything directly behind needs the body opened (half-turn) **and** a head turn.
- So: open the body first, then scan the shoulder you cannot see.

### 1.5 What to look for, in order
1. **Pressure:** where is the nearest opponent, and how fast is he closing? (`pressure.level`, `pressure.nearest_opponents`)
2. **Free teammates:** who is open, especially forward? (`open_teammates`, `passing_options`)
3. **Space:** where can I turn or carry the ball? (`free_space`)
4. **Goal:** can I shoot? (`shot`)
- Scan over **both** shoulders. The far-side shoulder shows the switch (`switch_options`).
- The key question of each scan: "If the ball came to me now, what would I do?" Have an answer **and** a second answer before the ball arrives.

### 1.6 Body shape and the half-turn
- Receive **side-on (half-turned)**: hips open, so you can see the ball and the pitch ahead at the same time.
- Let the ball run across your body and take it on the **back foot** (the foot further from the passer). First touch goes forward or into space, away from pressure.
- If `pressure.level` is high from behind, do not try to turn: set the ball back or sideways with one touch, then move again.
- If `pressure.level` is low and the scan showed space ahead, **turn and face forward**: it opens every option.
- If pressure is medium and comes from one side, the first touch goes to the **other** side (play away from pressure).

### 1.7 Scan cues for young players
- "Look before it comes." "Check both shoulders." "Know your next pass before the ball arrives."
- "Picture, then touch." "Two answers ready."
- Praise the look, not only the pass.

## 2. Phases of play and decision rules

| Phase | Where | Main aim | Default mode |
|---|---|---|---|
| Build-up | Defensive third | Keep the ball, draw the press, find the free player | keep, progress when a free player is forward |
| Progression | Middle third | Break lines; reach players between the opponent's lines | progress if a forward option is open, otherwise keep and circulate |
| Chance creation | Attacking third | Make a shot: through ball, cutback, combination, 1v1 | progress |
| Finishing | Within about 20 m of goal (`shot.distance_m` under 20) | Shoot with a clear lane; pick a corner; follow up | progress |
| Transition | First seconds after the ball changes team | Win it: attack fast. Lose it: press or recover | see section 9 |

How EagleEye's code reads the thirds: the pitch is split into three equal thirds of 35 m from the selected team's own goal line (defensive, middle, attacking). Across the pitch it uses five channels from the team's own view: left wing, left half-space, central channel, right half-space, right wing.

### 2.1 Build-up (defensive third)
- Width and depth: defenders spread wide, a midfielder shows in the middle, the goalkeeper is the spare option behind.
- If an opponent presses one defender, the free player is usually the one he left behind. Find him.
- Safe pass first, then forward. Never a square pass across your own box under pressure.
- **If** `pressure.level` is high **and** no forward pass is open, **then** play the safest open pass (biggest `receiver_space_m`) or back to the goalkeeper.
- **Count the press.** If the opponents press with fewer players than we have building (for example 2 forwards against 2 centre backs plus the goalkeeper), there is always a free player: find him with one or two passes.
- **Invite, then play through.** A slow pass between centre backs pulls the opponent's forwards across; the pass into the midfielder they just left is then open.
- A long ball is a fair choice when every short option is closed and the press is high; aim for a teammate's side of the pitch, not the middle of your own half.

### 2.2 Progression (middle third)
- The goal is to get the ball to a player who can **face forward** between or beyond the opponent's lines.
- **If** a pass option has positive `forward_m`, an open lane and good `receiver_space_m`, **then** it is a line-breaking chance: progress.
- **If** forward lanes are blocked, **then** move the ball sideways or back to change the angle, or look for a `third_man` or `switch_options`.
- A carry into `free_space` is a good way to progress when nobody is open ahead. A carry that makes a defender step out opens a pass behind him.
- Two or three sideways passes are fine if each one moves the opponent. Five sideways passes without a forward look is "passing for nothing".

### 2.3 Chance creation (attacking third)
- Be brave. Losing the ball here is cheap and a goal is close.
- Best routes: a pass behind the defence, a **cutback** (a low pass back from near the byline to a runner arriving in front of goal), a quick one-two, or a 1v1 when `free_space.space_m` is large.
- Look for the teammate with the highest `space_value`: he is in the most dangerous space your team can win.
- The most valuable cutback target is the area between the six-yard box and the penalty spot, roughly in front of the posts. Low and firm beats lifted and slow.

### 2.4 Finishing
- See section 8. Shoot early when the lane is clear; do not take one touch too many.

## 3. Risk and reward by zone

- **Defensive third: low risk.** A loss here can become a goal against in seconds. Simple passes, play away from pressure, clear the ball if there is no safe option.
- **Middle third: medium risk.** Try forward, but always keep one safe option behind or beside you.
- **Attacking third: high risk accepted.** Dribble, shoot, try the through ball or cutback.
- **Channels.** The central channel is the most valuable and the most crowded. The wings are safer but less dangerous. The **half-spaces** (between the wing and the centre) are a sweet spot: you can pass inside, outside, behind the defence, or shoot, and defenders are unsure who should mark you.
- A loss in the central channel of your own half is the most dangerous loss on the pitch. Be extra careful there.
- **The touchline is an extra defender.** On the wing you have only half the escape routes; when pressed there, play the first-time pass back inside or down the line before the trap closes.

### 3.1 Pressure cues (`pressure.level`)
- **High (opponent under 3 m):** one or two touches. Protect the ball with your body, play the simple pass, or shield and wait for support. Do not dribble in your own third.
- **Medium (3 to 6 m):** time for a controlled touch and a pass; turn only if the scan showed the space behind you was free.
- **Low (over 6 m):** you have time. Lift your head, face forward, and look for the line-breaking pass or a carry.
- Signs that pressure is coming: an opponent sprinting at you, two opponents closing from different sides, or your back to the opponent's goal near the touchline.

### 3.2 Time on the ball in seconds
- EagleEye's movement model has players running at about 7 m per second after a reaction of about 0.7 seconds.
- So an opponent 6 m away reaches you in a little over 1.5 seconds; one 3 m away in about 1 second. **Medium pressure means about one touch and one look; high pressure means play what you saw before the ball arrived.**
- Count every nearby opponent in `pressure.nearest_opponents`: two opponents within 6 m is a trap, even if the closest is not yet within 3 m. Move the ball quickly.

## 4. Game state, time and keep vs. progress

- **Level score:** use the zone rules in section 3.
- **Leading late (last 10 to 15 minutes): lower the risk.** Keep the ball, make the opponent chase, choose the safest open pass, avoid hopeful long balls, shoot only from a clear chance. EagleEye's rules lower the risk when leading from the 80th minute.
- **Trailing late: raise the risk.** Choose the forward option even if it is harder, get the ball into the attacking third quickly, shoot from a reasonable chance. EagleEye's rules raise the risk when trailing from the 75th minute.
- **Trailing by two or more, or the last few minutes:** risk goes up again. Speed matters more than safety.
- High pressure in your own third keeps the risk low whatever the score: a goal conceded there makes every game state worse.

### 4.1 Keep triggers (mode "keep")
- `pressure.level` high and no forward option open.
- Defensive third with the forward lanes blocked.
- Leading late in the game.
- Most of the team is behind the ball and not ready to support an attack.
- The only forward pass is long, blocked (`blocked_by` is not empty) or to a receiver with little space.
- The team has just made several fast forward actions and needs a moment to move up together ("rest with the ball").

### 4.2 Progress triggers (mode "progress")
- An open forward pass with good `receiver_space_m` or high `space_value`.
- A `third_man` combination or a `switch_options` player exists.
- `free_space.space_m` is large in front of you and `pressure.level` is low.
- The team just won the ball and the opponent is not organised (transition).
- Attacking third, trailing late, or a clear `shot` lane.

### 4.3 Reading the passing options
Each entry in `passing_options` gives the facts below. Read them together:

| Fact | What it means | Rule of thumb |
|---|---|---|
| `lane_open` / `blocked_by` | Is any opponent close enough to the pass line to cut it out? | A lane counts as blocked if an opponent is within about 2.5 m of the line, plus about 0.6 m for every 10 m of pass (about 3.7 m for a 20 m pass, 4.9 m for 40 m). Longer passes give defenders more time to step in. |
| `receiver_space_m` | Distance from the receiver to his nearest opponent | Under 4 m: not open. 4 to 8 m: open, but he needs a good first touch. Over 8 m: time to turn and look up. |
| `forward_m` | Metres gained toward the opponent's goal | Positive is forward. Over about 10 m usually means a line is broken. Negative is a safety pass. |
| `distance_m` | Pass length | 8 to 25 m is the comfortable range for young players. Over 25 m the pass is slower to arrive and less accurate. |
| `score` | EagleEye's mix of forward progress and receiver space, with a small cost for long passes | A quick ranking, not a decision. Mode and risk decide. |
| `space_value` | How dangerous the receiver's spot is, times how likely we are to win it | Higher means more dangerous. Use it to pick between two open forward options. |

- "Open" in EagleEye means **both** a clear lane **and** at least 4 m of space at the receiver. Only `open_teammates` may receive a pass.
- A receiver who is open but standing still with an opponent closing at speed is less open than the number shows. Prefer the receiver facing forward or moving into space.

## 5. Support, triangles and diamonds

### 5.1 Support angles and distances
- Support the ball carrier **at an angle**, never directly behind an opponent (in his "shadow"), where the pass cannot reach you.
- Good support distance is roughly 8 to 25 m: close enough for a quick, accurate pass, far enough that one opponent cannot press both players.
- Under heavy pressure, come a little closer; with time on the ball, spread out to make the pitch big.
- Offer options **behind** (safety), **beside** (to switch the angle) and **ahead** (to progress).
- **Cover shadow:** a defender standing between two attackers blocks the pass behind him without moving. A step or two sideways (about 2 to 4 m) is usually enough to leave his shadow.

### 5.2 Triangles (`triangles`)
- Three teammates in a triangle give the ball carrier two passing lanes at different angles. One defender cannot block both.
- A triangle needs real area. Three players in a straight line are not a triangle: one defender blocks both passes.
- EagleEye only counts a triangle when every side is about 6 to 35 m, both lanes and the lane between the two receivers are clear, and the area is at least 30 square metres. A bigger `area_m2` means more room to play through.
- After you pass, move to make the next triangle ("pass and move").

### 5.3 Diamonds
- Add a fourth player to a triangle and you get a diamond: one option behind, two at the sides, one ahead. The ball carrier always has a safe pass and a forward pass.

### 5.4 Overloads (more of us than them near the ball)
- **2v1:** the ball carrier dribbles straight at the defender to make him choose ("fix" him). If the defender steps to the ball, pass to the free teammate; if he stays with the teammate, keep going. Pass when the defender is committed, about 2 to 3 m away, not earlier.
- **3v2:** the middle player of the three usually holds the key: he can go left, right or pass through.
- Equal numbers can still give an advantage if our players are better placed: one deep, one wide, one between the lines forces the opponent to choose whom to mark.

## 6. Breaking lines, third man and switching play

### 6.1 Line-breaking passes
- A line-breaking pass goes **through or past a line of opponents** to a teammate who can receive and face forward. It removes several defenders with one pass.
- **If** a pass option is forward (`forward_m` positive), with an open lane and a receiver with space, **then** it is worth more than a safe square pass, unless the mode is keep.
- The pass should be firm and on the ground, to the receiver's far foot, so he can turn away from his marker.
- The receiver between the lines must scan before the pass: if a defender is right behind him, he plays the ball back or wide first time (a "set"), and the next player can play forward.

### 6.2 Third-man combination (`third_man`)
- The free player you want is blocked. Pass to a **link** player who can see him; the link plays the ball on, often first time, to the **third man**.
- It works because defenders watch the ball and its receiver while the third man moves.
- Timing: the third man starts his run as the first pass is played. Too early and he is marked again; too late and the window closes.
- The first pass goes to the link (the middle id), never straight to the runner.
- EagleEye only shows a third man who is forward, has at least 4 m of space, cannot be reached directly, and can be reached from an open link.

### 6.3 Switching play (`switch_options`)
- When the opponent crowds one side, the far side is usually open. EagleEye lists a switch when an open teammate is at least 25 m across the pitch.
- Switch **quickly**, in one or two passes. A slow switch lets the defence slide across.
- After a switch, the receiver should attack fast: dribble at a defender who has had to run far, or play forward at once.
- A long switch in the air is harder for young players; switching in two passes through a central player is often safer.

### 6.4 Width and depth
- **Width:** at least one player stays wide on each side to stretch the defence and open gaps inside.
- **Depth:** someone stays high (threatening to run behind) and someone stays deep (safe option). This stretches the opponent from front to back.
- Do not all go to the ball. Young players often bunch; spreading out creates the space.
- Five lanes rule of thumb: in the opponent's half, try to have a player in each of the five channels, and avoid two teammates in the same channel at the same height.

## 7. Off-the-ball movement and the best position

### 7.1 Getting free
- **Check away, then come short** (or the opposite): a short move one way pulls your marker, then you sprint into the space he left.
- Stand where the ball carrier can see you and the pass is not blocked. If a defender is between you and the ball, move a few steps until you see the ball clearly.
- Move into the gaps **between** opponents, not next to them.
- Stand on the defender's blind side (where he cannot see you and the ball at the same time), then move at the moment he looks at the ball.

### 7.2 The best position (`space_value.best_position`)
- EagleEye measures how valuable each spot is: closer to goal and more central is more dangerous, but only if your team can get there first.
- `best_position` is the most valuable spot you can reach before any opponent, where the ball can still reach you. It is the answer to "where should I be?".
- EagleEye looks for it within about 12 m (roughly a two-second run). The runner must arrive at least 0.3 seconds before any opponent, and the pass from the ball must be clear and no longer than 40 m.
- **If** `available_here` is false, the ball cannot reach you where you stand, so the run is about **getting free**.
- **If** the gain is large, the run is about **more dangerous space**.
- If `run_m` is under 2, you are already in the best spot: hold it and keep scanning.
- If there is no best position, there is no reachable spot with a clear pass right now: hold your position and keep scanning.
- Describe the run using only the `direction_text` and distance given. Never invent another spot.
- Defensive positions and goalkeeper positions are not modelled by EagleEye. Do not give a best position for them.

### 7.3 Timing runs
- Run when the ball carrier can pass: head up and the ball under control. Running while he is under pressure or looking down wastes the run.
- Runs behind the defence: start level with the last defender to stay onside, and bend the run so you can see the ball.
- If the pass does not come, return to a supporting position and get ready for the next one.
- One run can be for a teammate: a run that drags a defender away opens space for someone else. It is not wasted.

## 8. Dribbling, carrying and shooting

### 8.1 Dribble or pass?
- **Is there space in front?** Yes: carry or dribble into it. No: pass to an open teammate.
- Carry the ball at a defender to draw him out, then pass to the teammate he left free.
- Dribble when `free_space.space_m` is large and `pressure.level` is not high, or in a 1v1 in the attacking third.
- Do not dribble in your own third under pressure. Pass.
- Rules of thumb from EagleEye's training mode: a carry is a sensible choice when `free_space.space_m` is at least about 8 m and pressure is not high. A carry is "safe" when no opponent is within about 2 m of the carry line, you arrive before every opponent (running with the ball at about 5.5 m per second, slower than a sprint), and you still have at least 3.5 m of room at the end.
- `free_space` only looks ahead of you, within about 15 m. It is the most open spot to carry into, not a guarantee.

### 8.2 Shot selection and xG intuition (`shot`)
- **xG** (expected goals) is the chance that a shot like this becomes a goal. EagleEye estimates it from `shot.distance_m`, `shot.angle_deg` (how much of the goal you can see) and `shot.lane_clear`.
- Closer and more central is much better. EagleEye's own estimate for a clear, central shot:

| Distance from goal centre | Angle of goal visible | EagleEye xG (lane clear) | Lane blocked |
|---|---|---|---|
| 6 m | about 63 degrees | about 0.69 | about 0.28 |
| 8 m | about 49 degrees | about 0.51 | about 0.21 |
| 11 m (penalty spot area) | about 37 degrees | about 0.33 | about 0.13 |
| 16 m (edge of the box) | about 26 degrees | about 0.17 | about 0.07 |
| 20 m | about 21 degrees | about 0.11 | about 0.05 |
| 25 m | about 17 degrees | about 0.07 | about 0.03 |
| 30 m | about 14 degrees | about 0.04 | under 0.02 |

- The angle matters as much as distance: from 6 m out but 10 m wide, the visible angle is only about 20 degrees and the estimate drops to under 0.2.
- A blocked lane cuts the chance to well under half (EagleEye multiplies it by 0.4). The shot lane counts as blocked if an outfield opponent is within about 1.5 m of the line to the goal centre.
- **Shoot if** the lane is clear and you are inside about 20 to 25 m with a good angle. In training mode, a shot with a clear lane and xG of at least 0.1 is graded at least "ok" (unless the decision was too slow).
- **Pass instead if** a teammate is in a clearly better spot (closer, more central, clear lane) and the pass is open. A cutback to a teammate in front of goal is often worth more than a shot from a tight angle.
- Shots from wide, tight angles: the goalkeeper covers most of the goal. Look for the cutback first.
- Aim low and to a corner; follow every shot for the rebound.
- EagleEye's xG does not know the type of chance. In general football analysis, shots after a cutback or a through ball are worth much more than headers from crosses, and first-time shots from the cutback area are among the best chances in the game.

### 8.3 The 1v1 against a defender
- Attack the defender's front foot at speed; a change of pace beats him more often than a trick.
- Go when he is still running at you (his weight is moving), not when he is set and balanced.
- If a second defender is covering, use the 1v1 to fix the first one and pass.

## 9. Transition: the first seconds

### 9.1 Winning the ball (attacking transition)
- The opponent is spread out and not ready. The first look is **forward**: is there a pass behind or into space?
- **If** a forward pass or carry is on, **then** play it fast (mode "progress").
- **If** not, keep the ball with a safe pass away from the pressure, then build again.
- Fast attacks after winning the ball are short: most counter-attack goals take only a few seconds and two or three passes. Every extra touch gives the opponent a second to recover.
- The first pass should go **out of the zone where the ball was won**, because opponents nearby will counter-press.

### 9.2 Losing the ball (defensive transition)
- **Counter-press:** the nearest player presses the ball **at once**, for about five seconds. The opponent who just won it has not looked up yet.
- The next players block the nearest passing lanes; the others protect the middle.
- If the ball is not won back in those seconds, drop back quickly and get compact. Slow the attack and push it wide.

### 9.3 Rest defence
- While your team attacks, a few players stay behind the ball, mostly central, ready to stop a counter-attack.
- If everyone joins the attack, one lost pass leaves the goal open. A safe attack needs some players who do not go forward.
- A simple count: when attacking, keep at least one more defender than the opponents have forwards left high.

### 9.4 Defending principles (when the selected team does not have the ball)
EagleEye does not yet model defensive positions, but these ideas explain what the attacker is facing:
- **Pressure, cover, balance.** The first defender pressures the ball; the second covers behind him at an angle; the others balance the team and protect the middle and far side.
- **Delay before you tackle.** Approach fast, slow down for the last few metres, stay just over an arm's length away, and push the attacker toward the touchline or his weaker foot.
- **Pressing triggers** (moments to press together): a backward pass, a heavy first touch, a receiver with his back to goal, a pass toward the touchline, a slow or bouncing pass. One player pressing alone creates a gap; the press works when the nearest players go together.
- **Compactness.** Keep the distance between defenders and midfielders short so there is no space between the lines.

## 10. Common youth mistakes and coaching cues

| Mistake | Simple cue |
|---|---|
| Watching only the ball | "Look away, then look back. Check both shoulders." |
| Receiving square, facing your own goal | "Open up. Half-turn. Back foot." |
| Everyone chasing the ball (bunching) | "Make the pitch big. Find space." |
| Standing behind an opponent | "Can the passer see you? Move until he can." |
| Passing sideways when a forward pass is on | "Look forward first." |
| Forcing a risky pass under pressure in your own third | "Safe first. Keep it." |
| Dribbling into crowds | "Space in front? Go. No space? Pass." |
| Shooting from far with a blocked lane | "Closer and clearer, or find the cutback." |
| Stopping after a pass | "Pass and move. Make the next triangle." |
| Giving up after losing the ball | "Win it back. Five seconds." |
| Scanning while the ball is arriving | "Last look early. Then eyes on the ball." |
| Passing to the first teammate you see | "Who else is free? Find the second option." |
| Passing too early in a 2v1 | "Make him choose. Then pass." |
| Lifting the cutback | "Low and hard across the box." |
| Taking too many touches in a counter-attack | "Fewer touches, faster goal." |

### 10.1 Explaining to young players
- Use simple words and say *what to look at* before *what to do*, then *why*.
- One idea at a time: "Look right before the ball comes. #8 is free. Pass into the triangle."
- Use player numbers only, never names.
- Be encouraging and honest. Praise the scan, not just the result.

### 10.2 Language by age
- **Ages 10 to 12:** short sentences, one cue, everyday words. Turn football terms into pictures: "half-space" becomes "the gap between the wing and the middle"; "line-breaking pass" becomes "a pass past their players"; "third man" becomes "a pass to a friend who passes to the runner". Ask choice questions: "Was #7 free, or #9?"
- **Ages 13 to 16:** football terms are fine with a short explanation the first time. Ask "why" and "how" questions: "Why was the pass to #10 better than the pass to #4?" "How could you have seen #3 earlier?"
- Give thinking time before the answer. Asking first and telling second helps the idea stick.
- Talk about the moment, never the person: "That pass was risky because #5 was close", not "You always lose the ball".

### 10.3 Feedback that helps
- **Order:** one real thing done well, then the one most important thing missed (with where it was), then one concrete tip for the next rep.
- **Be specific.** "You checked your left shoulder twice" beats "Good scanning".
- **A good decision can fail, and a bad one can work.** Grade the choice and the scan, not only the result.
- **A mistake is information.** "Now you know #6 was behind you. Next time look right first."
- **Same tip, many reps.** Keep the tip the same until the habit changes; do not give a new correction every time.
- Useful phrases: "What did you see before the ball came?" "What else was possible?" "Where was the space?" "Who was free on the other side?"
