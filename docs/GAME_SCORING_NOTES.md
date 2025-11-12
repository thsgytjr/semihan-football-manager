# Game scoring and terminology updates

Date: 2025-11-11 (Updated: 2025-11-12)

- Terminology: "쿼터(Quarter)" → "게임(Game)" in the UI.
  - Labels now show "게임 점수" and period headers display as G1, G2, ...
- 3-team draft matches: winner is decided by points across games (3 for win, 1 for draw, 0 for loss).
  - **Weighted Points System (경기 수 불균형 처리)**:
    - When teams have played a different number of games, the system uses **weighted points** for fair ranking.
    - Each team is evaluated based on their best N games, where N = minimum games played across all teams.
    - Example: If T1 and T2 played 3 games each, and T3 played only 2 games:
      - T1: Sort their 3 game-points descending, take top 2 → weighted points
      - T2: Sort their 3 game-points descending, take top 2 → weighted points  
      - T3: All 2 games count → weighted points
      - Winner is determined by highest weighted points
    - This ensures fairness by comparing each team's best performance over equal game counts.
    - UI displays purple "가중 승점 적용" badge when weighted points are used.
  - Tie-breakers when weighted points are tied:
    1) Head-to-head points among tied teams
    2) Head-to-head goal difference among tied teams
    3) If still tied, treat as a draw (no single winner)
  - For 3 teams (T1, T2, T3) and six games, the pairing pattern is:
    - G1: T1 vs T2
    - G2: T2 vs T3
    - G3: T1 vs T3
    - G4: T1 vs T2
    - G5: T2 vs T3
    - G6: T1 vs T3
  - The same pattern repeats if more than 6 games are recorded.
  - Idle team in a game gets 0 points for that game.
- 2-team matches continue to decide the winner by number of game wins (per-period winners), then total goals as tiebreaker.
- 4+ teams: existing best goal-difference per game heuristic remains until further rules are defined.

Notes:
- Data structure remains `quarterScores` for backward compatibility. Only UI wording changed.
- If a tie on points occurs in 3-team matches, the match-level result is treated as a draw (no single winner). Potential tie-breakers (goal difference, total goals, head-to-head) can be added later if needed.
- Previous PPG (Points Per Game) approach was replaced with weighted points on 2025-11-12 for better fairness perception.
