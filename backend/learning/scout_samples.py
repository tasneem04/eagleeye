"""Offline research samples for KnowledgeScout (mock mode, or when the Foundry agent fails).

Written by the EagleEye team in our own words, for youth players. They let the
review/approve flow run without Azure, and are clearly labelled "offline sample"
wherever they appear. Only real KnowledgeScout runs use web search.
"""

SAMPLES = {
    "attacking set pieces (corners and free kicks)": {
        "summary": "Corners and wide free kicks work best when runs are timed together and the delivery area is agreed before the kick.",
        "insights": [
            "Agree one target zone before the corner is taken, for example the near post or the penalty spot, so runners and the taker aim for the same space.",
            "Start runs from deep and arrive late, because a moving attacker is much harder to mark than one standing still in the box.",
            "Keep at least two players outside the box at a corner: one for second balls and one to stop the quick counter-attack.",
            "A short corner changes the angle of the cross and pulls one defender out of the box, which can free a runner inside.",
        ],
        "rules_of_thumb": [
            "Most corner chances fall between the six-yard line and the penalty spot, roughly 5 to 11 m from goal.",
            "Begin the run about 1 second before the ball is struck, so you meet it at full speed.",
        ],
        "situation": {
            "situation": "Blue win a corner on the right. #5 and #4 stand on the edge of the box, #9 is near the keeper, #10 waits outside the box.",
            "scan": "Where is the zonal defender at the near post, and is anyone marking #5 or only watching the ball?",
            "best_decision": "#5 runs late across the near-post defender into the space between the six-yard line and the penalty spot.",
            "why": "The defender is watching the ball, so a late run from behind him arrives before he can react.",
            "common_mistake": "Everyone stands still on the six-yard line, so the keeper comes and catches the cross easily.",
        },
        "sources": [],
    },
    "defending set pieces and throw-ins": {
        "summary": "Set-piece defending needs clear jobs: who guards which zone, who marks which runner, and who stays ready for the counter.",
        "insights": [
            "Mix zonal and player marking: a few defenders guard key zones in front of goal while others follow the most dangerous runners.",
            "Stand where you can see both the ball and your runner, side-on, so you never have to turn your back on the ball.",
            "After the first header is cleared, the whole line steps out together, which leaves late attackers offside or far from goal.",
            "At a throw-in near your own box, mark the thrower's nearest options tightly, because a quick short throw is the most common restart.",
        ],
        "rules_of_thumb": [
            "Step the defensive line out about 10 m as soon as the ball is cleared to the edge of the box.",
            "A long throw travels roughly 20 to 30 m for young players, so the danger zone is the near post and the six-yard box.",
        ],
        "situation": {
            "situation": "Red have a throw-in level with Blue's penalty box. Red #7 is about to throw, Red #9 stands near Blue #3, and Red #8 is free 6 m away.",
            "scan": "Which Red player is closest to the thrower and unmarked, and where is the space behind Blue #3?",
            "best_decision": "Blue #6 steps tight to Red #8 so the short throw is covered, while #3 stays goal-side of Red #9.",
            "why": "Taking away the easy short option forces a longer, slower throw that the defence can read.",
            "common_mistake": "Everyone watches the thrower and the free player gets a short throw and a clear cross.",
        },
        "sources": [],
    },
    "1v1 defending and jockeying": {
        "summary": "In a 1v1 the defender's first job is to slow the attacker down and show him away from goal, not to dive in.",
        "insights": [
            "Close the space quickly while the ball is travelling, then slow down with short steps as the attacker controls it.",
            "Stand side-on with one foot forward to show the attacker one way, usually towards the touchline or his weaker side.",
            "Keep your eyes on the ball, not the body feints, because the ball only moves when the attacker touches it.",
            "Tackle when the attacker takes a heavy touch or looks down, since that is when the ball is furthest from his foot.",
        ],
        "rules_of_thumb": [
            "Stop about 1.5 to 2 m from the attacker: close enough to touch the ball, far enough not to be beaten by one touch.",
            "Delay for 2 to 3 seconds and a teammate can usually arrive to make it 2v1.",
        ],
        "situation": {
            "situation": "Red #11 receives on the left wing facing Blue #2 with 15 m of space behind #2. Blue #5 is 10 m away inside.",
            "scan": "Where is #5 covering from, and which side is the touchline?",
            "best_decision": "#2 closes fast, slows down at 2 m and shows #11 down the line, away from goal and towards the touchline.",
            "why": "Delaying buys time for #5 to cover, and the touchline acts like an extra defender.",
            "common_mistake": "Diving in at full speed, so one touch past #2 leaves #11 running at goal.",
        },
        "sources": [],
    },
    "on-pitch communication": {
        "summary": "Short, early calls give a teammate information he cannot see, which saves him a scan and speeds up the decision.",
        "insights": [
            "Use one or two words that the whole team agrees on, such as 'man on', 'time' or 'turn', so the message is understood instantly.",
            "Call before the ball reaches your teammate, because a call after his first touch is usually too late to help.",
            "The player behind the ball sees the most, so defenders and the goalkeeper should talk the most.",
            "Praise or correct after the move ends, not during it, so the player stays focused on the next action.",
        ],
        "rules_of_thumb": [
            "A useful call lasts under 1 second and is given at least 1 second before the ball arrives.",
            "Keep the team's call list to about 5 words that everyone knows.",
        ],
        "situation": {
            "situation": "Blue #6 is about to receive from #4 with his back to goal. Red #10 is closing from behind, 4 m away. #4 can see this but #6 cannot.",
            "scan": "#4 checks where Red #10 is coming from while he plays the pass.",
            "best_decision": "#4 calls 'man on' as the ball leaves his foot, and #6 sets it back first time instead of turning.",
            "why": "The call gives #6 the picture behind him, so he avoids turning into pressure.",
            "common_mistake": "Nobody talks, #6 turns into Red #10 and loses the ball in the middle.",
        },
        "sources": [],
    },
    "receiving with both feet": {
        "summary": "Players who can receive and pass with either foot have more options and need less time to play forward.",
        "insights": [
            "Receiving on the back foot (the foot further from the passer) opens the body and lets you face forward in one touch.",
            "Using the weaker foot when it is the right foot keeps the ball away from the defender instead of bringing it back into him.",
            "Practise short passes with the weaker foot first; range comes later, but accuracy at short distance is used most in games.",
            "A player who only uses one foot becomes predictable, because a defender can simply block that side.",
        ],
        "rules_of_thumb": [
            "Aim for about 1 in every 3 practice touches on the weaker foot for young players.",
            "A first touch that travels 1 to 2 m into space is usually ideal: far enough to escape, close enough to keep control.",
        ],
        "situation": {
            "situation": "Blue #8 receives in the middle third with Red #6 approaching from his right. The open space is to his left.",
            "scan": "Which side is the pressure coming from, and which teammate is free on the left?",
            "best_decision": "#8 receives with his left foot, the back foot, and takes the first touch away to the left into space.",
            "why": "The left foot keeps his body between the ball and Red #6 and turns him towards the open side.",
            "common_mistake": "Stopping the ball with the stronger right foot, which brings it straight towards Red #6.",
        },
        "sources": [],
    },
    "small-sided games and rondos": {
        "summary": "Small-sided games and rondos give young players many more touches and decisions than a full-size match.",
        "insights": [
            "Fewer players per side means each player touches the ball far more often and has to scan and decide more often.",
            "A rondo (keep-away in a circle) trains the half-turn, the first touch and the passing angle all at once.",
            "Changing the pitch size changes the problem: a small area trains quick decisions, a bigger area trains passing range and running.",
            "Adding a rule such as 'two touches maximum' forces players to scan before the ball arrives.",
        ],
        "rules_of_thumb": [
            "A 4v4 game gives each player several times more touches than an 11v11 match of the same length.",
            "Keep each rondo round short, around 1 to 2 minutes, so intensity and focus stay high.",
        ],
        "situation": {
            "situation": "In a 5v2 rondo, Blue #3 receives the ball while both Red players press from his left.",
            "scan": "Before the pass arrives, which teammate is on the opposite side to the pressure?",
            "best_decision": "#3 opens his body and passes first time to the teammate on his right, away from both Red players.",
            "why": "Playing away from the pressure keeps the ball and makes the Red players run again.",
            "common_mistake": "Taking a touch towards the pressure, which lets the two Red players trap him.",
        },
        "sources": [],
    },
}
