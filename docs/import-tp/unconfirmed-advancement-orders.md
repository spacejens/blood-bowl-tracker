# Unconfirmed TP advancement orders

A local full import of the TP dumps (2026-11-02) confirmed the
[advancement order](../glossary.md#advancement-order) of every BBL player and
of 426 of 445 TP players with advancements. This page records, for each of the
other 19, what was found and why the order is or is not established, so the
question is not reopened without new information. The figures can change if
the rosters are downloaded again.

## How a TP order is established

A TP player's gained skills are taken in ascending order of TP's per-skill row
id, a global counter. Ordering by it fits the SPP the player spent in every
checked case where the spend constrains the skill order, far more often than
TP's list order does; the counted evidence is in
[Order of advancements](../import-tp-live/index.md#order-of-advancements). The
SPP deduction then prices every order
of the player's advancements with the era's cost table (BB2020 for the Third
era, BB2025 for the Fourth), where the spend is the player's total SPP minus
the unspent SPP. It confirms an order only when the spend admits one order, or
when all fitting orders cost the same.

A characteristic increase carries no row id, so only the spend can place it
among the skills. Where several placements fit the spend, nothing in the TP
data tells them apart. Each entry below gives the line-up id, the paid
advancements as skills plus increases, and the SPP spent.

## Resolved

- **Nadiddnur** (Shambletown Peddlers, Third era, line-up 1421046, paid 3+0
  as TP records it, spent 14): his gained Loner is a
  [free extra](../game-concepts/skills/index.md#player-skills), so two paid
  skills remain, Dirty Player (+1), a random secondary skill, and Sneaky Git,
  a chosen primary, and his 14 SPP spend fits exactly. Batch 005 records the
  order Dirty Player, then Sneaky Git: the feed shows only Sneaky Git, at 8
  SPP (2025-04-16), the price of a second chosen primary skill, and TP's
  skill row ids give the same order. Applying the batch also flags his stored
  Loner as a free extra when its stored flag is not set. TP records level
  2 against 3 recorded skills, which the free Loner explains.
- **Journeyman** (Elfyville Canaries, Third era, line-up 2454051, paid 1+0,
  spent 0): the only skill TP lists is Loner, which is his starting skill (a
  [journeyman](../game-concepts/players/index.md#journeymen) has Loner
  without spending SPP), so he has no gained skill and no paid advancement to
  order. His level is 0 and his spend is 0.

Among TP players, a gained Loner that stays a gained skill exists only for
Nadiddnur. BBL also records a Loner for journeymen who have no other
advancement; those journeymen likewise have no gained skill, as their Loner is
a starting skill. Batch 005's entries for them flag nothing and are still
accepted.

- **Kalle Kvist** (Dalsland Treehuggers, line-up 586220, paid 4+2, spent
  110), **Friska Fläkten** (Gnaget, line-up 1233619, paid 5+1, spent 104),
  **K'Lent** (Mega Molochs, line-up 587380, paid 2+2, spent 64) and
  **Gruamax** (Marstens IF Mrglgrlgrlgrl, line-up 1346393, paid 2+1, spent
  32): confirmed from the TP feed, recorded in batch 005. The feed's
  notifications cover every paid advancement of each, and the prices TP
  charged add up to the reported spend. Notification dates: Kalle 2023-09-21
  to 2024-04-10, Friska 2024-08-09 to 2025-05-26, K'Lent 2023-09-20 to
  2025-12-13, Gruamax 2024-10-10 to 2024-12-03. The TP data alone admits
  several orders for each player's spend and places none of the characteristic
  increases.

## Spend not explainable by the recorded history

For these players no order of the recorded advancements costs the reported
spend, so no order can be confirmed. A curated order is refused by the manual
import's SPP check for the same reason, whenever the player's SPP figures are
stored.

- **Snarg Half-Thought** (Masthugget Lucky Cocks, Fourth era, line-up
  2464143, paid 3+0, spent 38): TP level is 4 but only 3 advancements are
  recorded. The spend fits with one more random primary skill, or with one
  recorded skill priced as a characteristic increase.
- **Ghudarshin** (Rocket from the Tombs, Fourth era, line-up 2589855, paid
  2+0, spent 19): fits with one more random primary skill, or with one
  recorded skill priced as a characteristic increase.
- **Curd And Lemon** (Masthugget Lucky Cocks, Fourth era, line-up 2568039,
  paid 1+0, spent 14): fits with one more random primary skill, or with
  the skill priced as a characteristic increase.
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

The TP notification feed on Discord holds a "New skill/characteristic"
notification for each advancement a player takes, with the SPP TP charged for
it. The whole channel history was paged, 12,561 messages back to the start of
the channel on 2022-11-22, which held 1,394 such notifications. They were
matched to the 19 players by name and team, and read oldest first (two on the
same day by message id). The feed's price per notification is given in SPP
below.

The five players in batch 005 are listed under Resolved. For the others the
feed shows:

- **Snarg Half-Thought:** Secondary Block (10), Primary Guard (12), Primary
  Stand Firm (16), summing to 38, the spend. The order is known, but the
  prices are not those the cost model gives the recorded advancements, so the
  server would refuse an order and none is curated.
- **Ghudarshin:** Random Primary Block (3), Primary On the Ball (16), summing
  to 19, the spend. Same: known order, no curated order.
- **Curd And Lemon:** Secondary Pro (14), the spend. Same.
- **Pedes Celeres:** Primary Block (14), the spend. Same.
- **Phoneira:** Random Primary Side Step (3), Random Characteristics +1 MA
  (20), Random Characteristics +1 MA (24), Primary Block (28), summing to 75,
  the spend. Same.
- **Vassili:** Primary Block (6), Random Characteristics +1 MA (20), Primary
  Side Step (12), Primary Sprint (28), summing to 66, the spend. Same.
- **Sergei:** Primary Tackle (6), Primary Mighty Blow (+1) (8), Primary Guard
  (24), Primary Frenzy (16), Random Primary Dirty Player (+1) (10), summing
  to 64, the spend. Same.
- **Klo-Oukh:** Secondary Block (18), the spend. Same.
- **Claudia von Drak:** the feed shows two advancements, Primary Dodge (6) and
  Random Characteristics +1 MA (20), summing to 26, the spend, while the
  database records one paid advancement.
- **Nanna:** the feed shows two Random Characteristics +1 MA notifications
  (18 and 20), summing to 38, the spend, while the database records one
  increase.
- **Paddan:** the feed shows three advancements, Random Primary Cannoneer (3),
  Random Primary Pass (4) and Random Characteristics +1 PA (24), summing to
  31, the spend, while the database records four (three skills and one
  increase).
- **Penthesilea:** the feed shows four of her five advancements, Random
  Characteristics +1 MA (18), Random Characteristics +1 MA (20), Primary Sure
  Hands (12) and Primary Accurate (28), summing to 78 of the spend of 88.
- **Journeyman** (Elfyville Canaries): never appears in the feed.
- **Button:** one notification, Primary Dirty Player (6), and no spent figure
  to compare it with.

For the players whose feed matches the spend but not the recorded
advancements, the feed and the database disagree on what the player took;
this page does not establish which is right.

## Curating an order

A player's order can be recorded by hand in a manual import batch (see
[Player advancement orders](../import-manual/player-advancement-orders.md));
when the player's SPP figures are stored, the import refuses any order the
reported spend does not allow.
