# Unconfirmed TP advancement orders

A local full import of the TP dumps (2026-11-02) confirmed the
[advancement order](../glossary.md#advancement-order) of every BBL player and
of 426 of 445 TP players with advancements. This page records, for each of the
other 19, what was found and why the order is or is not established, so the
question is not reopened without new information. The figures can change if
the rosters are downloaded again.

## How a TP order is established

A TP player's gained skills are taken in ascending order of TP's per-skill row
id, a global counter. Ordering by it fitted the SPP the player spent in every
case where the spend constrains the skill order: 80 of 80 confirmed players,
against 27 of 80 for TP's list order. The SPP deduction then prices every order
of the player's advancements with the era's cost table (BB2020 for the Third
era, BB2025 for the Fourth), where the spend is the player's total SPP minus
the unspent SPP. It confirms an order only when the spend admits one order, or
when all fitting orders cost the same. See
[Order of advancements](../import-tp-live/index.md#order-of-advancements).

A characteristic increase carries no row id, so only the spend can place it
among the skills. Where several placements fit the spend, nothing in the TP
data tells them apart. Each entry below gives the line-up id, the paid
advancements as skills plus increases, and the SPP spent.

## Resolved

- **Nadiddnur** (Shambletown Peddlers, Third era, line-up 1421046, paid 3+0,
  spent 14): his gained Loner is a
  [free extra](../game-concepts/skills/index.md#player-skills), so two paid
  skills remain and his 14 SPP spend fits exactly; the deduction confirms the
  order the next time he is imported. TP records level 2 against 3 recorded
  skills, which the free Loner explains.
- **Journeyman** (Elfyville Canaries, Third era, line-up 2454051, paid 1+0,
  spent 0): the only gained skill is Loner, a free extra, so he has no paid
  advancement to order. His level is 0 and his spend is 0.

A gained Loner is a paid skill for only these two players in the whole data.

## Ambiguous placement of characteristic increases

For these four players several orders fit the spend at different costs, and
nothing in the TP data places the increases.

- **Kalle Kvist** (Dalsland Treehuggers, Third era, line-up 586220, paid 4+2,
  spent 110): 48 orders fit the spend, 4 of them keep the skill id order, and
  they give 2 distinct cost sequences.
- **Friska Fläkten** (Gnaget, Third era, line-up 1233619, paid 5+1, spent 104):
  600 orders fit, 5 keep the id order, and they give 5 cost sequences.
- **K'Lent** (Mega Molochs, Third era, line-up 587380, paid 2+2, spent 64): 6
  orders fit, all keep the id order, and they give 3 cost sequences.
- **Gruamax** (Marstens IF Mrglgrlgrlgrl, Third era, line-up 1346393, paid
  2+1, spent 32): 2 orders fit, giving 2 cost sequences.

## Spend not explainable by the recorded history

For these players no order of the recorded advancements costs the reported
spend, so no order can be confirmed. A curated order is refused by the manual
import's SPP check for the same reason.

- **Snarg Half-Thought** (Masthugget Lucky Cocks, Fourth era, line-up
  2464143, paid 3+0, spent 38): TP level is 4 but only 3 advancements are
  recorded. The spend fits with one more random primary skill, or with one
  recorded skill priced as a characteristic increase.
- **Ghudarshin** (Rocket from the Tombs, Fourth era, line-up 2589855, paid
  2+0, spent 19): fits with one more random primary skill, or with one
  recorded skill priced as a characteristic increase.
- **Curd And Lemon** (Masthugget Lucky Cocks, Fourth era, line-up 2568039,
  paid 1+0, spent 14): fits with one more random primary skill, with a
  characteristic increase instead of the skill, or with the skill priced as
  one.
- **Pedes Celeres** (Crookback Mountain Misfits, Fourth era, line-up 2477740,
  paid 1+0, spent 14): fits with one more chosen primary skill, or with the
  skill priced as a characteristic increase.
- **Phoneira** (Amaxon Gorgons, Third era, line-up 722701, paid 2+2, spent
  75): the nearest cost is 63. Fits with one more random primary skill, or
  with one skill priced as a characteristic increase.
- **Vassili** (Kislev Ursa Cossacks, Third era, line-up 1232618, paid 3+1,
  spent 66): the nearest cost is 54. Fits with one more random primary skill,
  or with one skill priced as a characteristic increase.
- **Claudia von Drak** (Drakenhof Biteclub, Third era, line-up 870139, paid
  1+0, spent 26): fits with one more characteristic increase.
- **Nanna** (Gyttjevrålarna, Third era, line-up 1256093, paid 0+1, spent 38):
  fits with a second characteristic increase.
- **Paddan** (Shambletown Peddlers, Third era, line-up 733570, paid 3+1,
  spent 31): the nearest cost is 40. Fits with one fewer advancement,
  dropping the random secondary skill.
- **Penthesilea** (Amaxon Gorgons, Third era, line-up 607542, paid 3+2, spent
  88): the nearest cost is 83, and no single added or removed advancement
  fits. It fits if one skill is priced as a characteristic increase, or if one
  chosen primary skill is priced as a chosen secondary.
- **Sergei** (Kislev Ursa Cossacks, Third era, line-up 1232624, paid 5+0,
  spent 64): the nearest cost is 59, and no single added or removed
  advancement fits. He has one armour reduction. It fits if one skill is
  priced as a characteristic increase, or if one chosen primary skill is
  priced as a chosen secondary.
- **Klo-Oukh** (Mega Molochs, Third era, line-up 2094737, paid 1+0, spent
  18): the recorded skill would cost 12, while 18 is the cost of a
  characteristic increase.

Match files embed a roster snapshot per match, but for every Third-era player
here all snapshots are identical, a copy taken at download time rather than a
history. Only the Fourth-era players Snarg, Ghudarshin, Button and Curd And
Lemon show two states, from two download dates in 2026. No skill of these
players is hidden, injury reductions explain none of the one-more-increase
cases, and the `mercenary` field is empty for everyone.

## Inconsistent SPP

- **Button** (Masthugget Lucky Cocks, Fourth era, line-up 2464153, paid 1+0,
  spent unknown): the database has total 9 and no unspent figure, while the
  roster file says total 7 and unspent 3 (spent 4), which no 6 SPP skill fits
  either.

## The TP feed

The TP notification feed on Discord was checked for "New skill/characteristic"
notifications of these players. The latest 100 feed messages (2026-10-29 to
2026-11-10) mention none of them.

## Curating an order

A player's order can be recorded by hand in a manual import batch (see
[Player advancement orders](../import-manual/player-advancement-orders.md));
the import refuses any order the reported spend does not allow.
