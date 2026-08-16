# Fireworld

A top-down game where a character navigates a fixed large map while enemies continuously flood in. The player starts with one of three weapon types and can expand to carry up to three.

## Language

**Character**:
The player-controlled unit that moves through the map, fights enemies, and collects experience.
_Avoid_: Player, hero, avatar

**Enemy**:
An AI-controlled hostile unit that spawns continuously and attacks the character.
_Avoid_: Monster, mob, foe

**Mini-boss**:
An independent enemy type stronger than regular enemies that drops a weapon pickup on defeat.
_Avoid_: Elite, sub-boss, champion

**Weapon Type**:
A distinct combat mode with unique behavior. The game has more than 3 weapon types, but the character can carry at most 3 at a time.
_Avoid_: Weapon class, weapon category

**Weapon Stat**:
A numeric property of a weapon type that can be upgraded through level-up options. Includes damage, fire rate, magazine capacity, reload speed, penetration, and bullet count.
_Avoid_: Weapon attribute, weapon parameter

**Main Weapon**:
The weapon type chosen at the start of the game. Always occupies one of the weapon slots.
_Avoid_: Primary weapon, starting weapon

**Secondary Weapon**:
A weapon type acquired later through weapon drops. Occupies additional weapon slots up to the maximum of 3.
_Avoid_: Sub weapon, off-hand weapon

**Automatic Attack**:
All equipped weapons fire simultaneously and auto-target nearby enemies. The player does not manually aim or switch weapons.
_Avoid_: Manual aim, weapon switching, active attack

**Experience Point (XP)**:
A collectible item dropped by defeated enemies. Accumulating XP to a threshold triggers a level-up.
_Avoid_: EXP, skill point, essence

**Level-Up**:
A state transition triggered when accumulated XP reaches a threshold. Presents 3 random upgrade options.
_Avoid_: Leveling, rank-up, promotion

**Upgrade Option**:
One of three randomly presented choices upon level-up. Can enhance an owned weapon or expand weapon capacity.
_Avoid_: Perk, buff, talent

**Weapon Expansion**:
Increasing the number of weapon slots the character can carry, up to a maximum of 3.
_Avoid_: Unlock slot, weapon capacity

**Weapon Drop**:
An item dropped by a Mini-boss. When picked up, presents 3 options of weapon types the character does not yet own.
_Avoid_: Loot, weapon pickup

**Chest**:
A drop from certain enemies. Contains recovery items or stat bonuses.
_Avoid_: Loot box, crate