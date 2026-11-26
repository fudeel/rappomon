use crate::model::*;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub struct Engine {
    world: World,
    save: Option<Save>,
    notice: String,
    talk: Option<Talk>,
    shop: Option<Entity>,
    starters: bool,
    minigame: Option<Entity>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Command {
    Load {
        world: Option<Box<World>>,
        save: Option<Box<Save>>,
        seed: Option<u32>,
    },
    Reset {
        seed: Option<u32>,
    },
    Walk {
        direction: String,
    },
    Interact,
    Choice {
        index: usize,
    },
    Close,
    SelectStarter {
        id: String,
    },
    Move {
        index: usize,
    },
    Switch {
        index: usize,
    },
    Item {
        id: String,
        index: usize,
    },
    Flee,
    Buy {
        id: String,
    },
    Sell {
        id: String,
    },
    Store {
        index: usize,
    },
    Withdraw {
        index: usize,
    },
    Unequip {
        index: usize,
    },
    Minigame {
        score: u32,
        accuracy: u8,
        cleared: bool,
    },
}

fn conditions(flags: &Flags, needs: &Flags) -> bool {
    needs
        .iter()
        .all(|(key, value)| flags.get(key).copied().unwrap_or(false) == *value)
}

fn entity_present(entity: &Entity, flags: &Flags, map_id: &str) -> bool {
    if !conditions(flags, &entity.when) {
        return false;
    }
    let prefix = match entity.kind.as_str() {
        "item" => "taken",
        "wild" => "won",
        _ => return true,
    };
    flags.get(&format!("{prefix}:{map_id}/{}", entity.id)) != Some(&true)
}

fn delta(facing: &str) -> (i32, i32) {
    match facing {
        "up" => (0, -1),
        "left" => (-1, 0),
        "right" => (1, 0),
        _ => (0, 1),
    }
}

fn roll(save: &mut Save, max: u32) -> u32 {
    save.rng = save.rng.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    (save.rng >> 8) % max
}

fn add_item(save: &mut Save, id: &str, amount: u16) {
    let count = save.bag.entry(id.to_owned()).or_default();
    *count = count.saturating_add(amount);
}

fn debit_item(save: &mut Save, id: &str) {
    if let Some(count) = save.bag.get_mut(id) {
        *count = count.saturating_sub(1);
    }
}

fn max_hp(species: &Species, level: u8) -> u16 {
    species.hp.saturating_add(u16::from(level) * 3)
}

fn moves_at(world: &World, species: &Species, level: u8) -> Vec<MoveSlot> {
    let mut learned = Vec::new();
    for learn in species.learns.iter().filter(|learn| learn.at <= level) {
        if let Some(flow) = world.moves.get(&learn.move_id) {
            learned.retain(|slot: &MoveSlot| slot.id != learn.move_id);
            learned.push(MoveSlot {
                id: learn.move_id.clone(),
                pp: flow.pp,
            });
        }
    }
    if learned.len() > 4 {
        learned.drain(..learned.len() - 4);
    }
    learned
}

fn make_monster(world: &World, id: &str, level: u8) -> Option<Monster> {
    let species = world.species.get(id)?;
    let hp = max_hp(species, level);
    Some(Monster {
        species: id.to_owned(),
        level,
        xp: 0,
        hp,
        max_hp: hp,
        moves: moves_at(world, species, level),
        status: String::new(),
        held: String::new(),
    })
}

fn accessible(world: &World, save: &Save, position: &Spawn) -> bool {
    let Some(map) = world.maps.get(&position.map) else {
        return false;
    };
    map.tile_at(position.x, position.y)
        .and_then(|tile| world.tiles.get(&tile))
        .is_some_and(|tile| !tile.blocked)
        && !map.entities.iter().any(|entity| {
            entity.x == position.x
                && entity.y == position.y
                && entity.solid
                && entity_present(entity, &save.flags, &position.map)
        })
}

fn heal_all(world: &World, save: &mut Save) {
    for monster in &mut save.party {
        monster.hp = monster.max_hp;
        monster.status.clear();
        for slot in &mut monster.moves {
            if let Some(flow) = world.moves.get(&slot.id) {
                slot.pp = flow.pp;
            }
        }
    }
}

impl Save {
    fn fresh(world: &World, seed: u32) -> Self {
        Self {
            position: world.start.clone(),
            checkpoint: world.start.clone(),
            facing: "down".into(),
            party: make_monster(world, &world.starter, 5).into_iter().collect(),
            reserve: Vec::new(),
            bag: world.initial_bag.clone(),
            flags: world.initial_flags.clone(),
            money: 300,
            seen: BTreeSet::from([world.starter.clone()]),
            owned: BTreeSet::from([world.starter.clone()]),
            steps: 0,
            repel: 0,
            rng: seed,
            battle: None,
            starter_locked: false,
            scores: BTreeMap::new(),
        }
    }

    fn repair(&mut self, world: &World) {
        let normalize = |monster: &mut Monster| {
            let Some(species) = world.species.get(&monster.species) else {
                return false;
            };
            monster.level = monster.level.clamp(1, 100);
            monster.max_hp = max_hp(species, monster.level);
            monster.hp = monster.hp.min(monster.max_hp);
            monster.moves.retain_mut(|slot| {
                if let Some(flow) = world.moves.get(&slot.id) {
                    slot.pp = slot.pp.min(flow.pp);
                    true
                } else {
                    false
                }
            });
            monster.moves.truncate(4);
            if monster.moves.is_empty() {
                monster.moves = moves_at(world, species, monster.level);
            }
            if !world.items.contains_key(&monster.held) {
                monster.held.clear();
            }
            true
        };
        let party_count = self.party.len();
        self.party.retain_mut(normalize);
        self.reserve.retain_mut(normalize);
        if self.party.len() > 6 {
            self.reserve.extend(self.party.drain(6..));
        }
        if self.party.is_empty() {
            self.party.extend(make_monster(world, &world.starter, 5));
            self.owned.insert(world.starter.clone());
            self.seen.insert(world.starter.clone());
        }
        if let Some(battle) = &mut self.battle {
            let valid = battle.enemies.iter_mut().all(normalize);
            if !valid
                || battle.enemy >= battle.enemies.len()
                || battle.active >= self.party.len()
                || party_count != self.party.len()
                || !self.party.iter().any(|monster| monster.hp > 0)
            {
                self.battle = None;
            }
        }
        if !accessible(world, self, &self.checkpoint) {
            self.checkpoint = world.start.clone();
        }
        if !accessible(world, self, &self.position) {
            self.position = self.checkpoint.clone();
            self.battle = None;
        }
        if !accessible(world, self, &self.position) {
            let map = &world.maps[&world.start.map];
            if let Some(position) = map
                .rows
                .iter()
                .enumerate()
                .flat_map(|(y, row)| {
                    row.chars().enumerate().map(move |(x, _)| Spawn {
                        map: world.start.map.clone(),
                        x: x as i32,
                        y: y as i32,
                    })
                })
                .find(|position| accessible(world, self, position))
            {
                self.position = position.clone();
                self.checkpoint = position;
            }
        }
        if self.battle.is_none() && !self.party.iter().any(|monster| monster.hp > 0) {
            heal_all(world, self);
        }
    }
}

impl Engine {
    pub fn dispatch(&mut self, input: Value) -> Value {
        let command: Command = match serde_json::from_value(input) {
            Ok(command) => command,
            Err(error) => return json!({"error": error.to_string()}),
        };
        self.notice.clear();
        let include_world = matches!(command, Command::Load { .. });
        if let Command::Load { world, save, seed } = command {
            let world = world.map(|world| *world).unwrap_or_default();
            if let Err(error) = world.validate() {
                return json!({"error": error});
            }
            self.world = world;
            let mut save = save
                .map(|save| *save)
                .unwrap_or_else(|| Save::fresh(&self.world, seed.unwrap_or(72)));
            save.repair(&self.world);
            self.save = Some(save);
            self.talk = None;
            self.shop = None;
            self.starters = false;
            self.minigame = None;
        } else {
            if self.save.is_none() {
                self.save = Some(Save::fresh(&self.world, 72));
            }
            self.act(command);
        }
        let mut result = json!({
            "save": self.save, "notice": self.notice, "talk": self.talk,
            "shop": self.shop, "starters": self.starters, "minigame": self.minigame,
        });
        if include_world {
            result["world"] = json!(self.world);
        }
        result
    }

    fn act(&mut self, command: Command) {
        match command {
            Command::Reset { seed } => {
                self.save = Some(Save::fresh(&self.world, seed.unwrap_or(72)));
                self.talk = None;
                self.shop = None;
                self.starters = false;
                self.minigame = None;
            }
            Command::Close => {
                if let Some(talk) = self.talk.take() {
                    self.save.as_mut().unwrap().flags.extend(talk.sets);
                }
                self.shop = None;
                self.starters = false;
                self.minigame = None;
            }
            Command::Minigame {
                score,
                accuracy,
                cleared,
            } => self.finish_minigame(score, accuracy, cleared),
            Command::Choice { index } => self.choose(index),
            Command::SelectStarter { id } => self.select_starter(&id),
            Command::Walk { direction } => self.walk(direction),
            Command::Interact => self.interact(),
            Command::Buy { id } => self.trade(&id, false),
            Command::Sell { id } => self.trade(&id, true),
            Command::Store { index } => self.transfer(index, false),
            Command::Withdraw { index } => self.transfer(index, true),
            Command::Unequip { index } => {
                let save = self.save.as_mut().unwrap();
                if save.battle.is_none() {
                    if let Some(monster) = save.party.get_mut(index) {
                        let held = std::mem::take(&mut monster.held);
                        if !held.is_empty() {
                            add_item(save, &held, 1);
                        }
                    }
                }
            }
            Command::Move { index } => self.use_move(index),
            Command::Switch { index } => self.switch(index),
            Command::Item { id, index } => self.use_item(&id, index),
            Command::Flee => self.flee(),
            Command::Load { .. } => unreachable!(),
        }
    }

    fn walk(&mut self, direction: String) {
        let save = self.save.as_mut().unwrap();
        if self.talk.is_some()
            || self.shop.is_some()
            || self.starters
            || self.minigame.is_some()
            || save.battle.is_some()
        {
            return;
        }
        if !["up", "down", "left", "right"].contains(&direction.as_str()) {
            return;
        }
        let (dx, dy) = delta(&direction);
        save.facing = direction;
        let mut to = save.position.clone();
        to.x += dx;
        to.y += dy;
        if !accessible(&self.world, save, &to) {
            return;
        }
        save.position = to;
        save.steps = save.steps.saturating_add(1);
        let map = &self.world.maps[&save.position.map];
        if let Some(exit) = map.entities.iter().find(|entity| {
            entity.kind == "exit"
                && entity.x == save.position.x
                && entity.y == save.position.y
                && conditions(&save.flags, &entity.when)
        }) {
            if conditions(&save.flags, &exit.requires) {
                if let Some(destination) = &exit.destination {
                    if accessible(&self.world, save, destination) {
                        save.position = destination.clone();
                        save.flags.extend(exit.sets.clone());
                        return;
                    }
                }
            } else if !exit.locked.is_empty() {
                self.notice.clone_from(&exit.locked);
            }
        }
        if save.repel > 0 {
            save.repel -= 1;
            if save.repel == 0 {
                self.notice = "The noise filter wore off.".into();
            }
            return;
        }
        let in_zone = map
            .tile_at(save.position.x, save.position.y)
            .and_then(|tile| self.world.tiles.get(&tile))
            .is_some_and(|tile| tile.encounters);
        if !in_zone || roll(save, 100) >= u32::from(map.encounter_rate) {
            return;
        }
        let pool: Vec<_> = map
            .encounters
            .iter()
            .filter(|entry| conditions(&save.flags, &entry.when))
            .collect();
        if !pool.is_empty() {
            let encounter = pool[roll(save, pool.len() as u32) as usize];
            start_battle(
                &self.world,
                save,
                "",
                "",
                &[encounter.clone()],
                0,
                Flags::new(),
                true,
            );
        }
    }

    fn interact(&mut self) {
        let save = self.save.as_ref().unwrap();
        if save.battle.is_some()
            || self.talk.is_some()
            || self.shop.is_some()
            || self.starters
            || self.minigame.is_some()
        {
            return;
        }
        let (dx, dy) = delta(&save.facing);
        let position = &save.position;
        let map = &self.world.maps[&position.map];
        let valid = |entity: &&Entity| {
            entity.kind != "light"
                && entity.kind != "decor"
                && entity_present(entity, &save.flags, &position.map)
        };
        let entity = map
            .entities
            .iter()
            .filter(valid)
            .find(|entity| entity.x == position.x + dx && entity.y == position.y + dy)
            .or_else(|| {
                map.entities
                    .iter()
                    .filter(valid)
                    .find(|entity| entity.x == position.x && entity.y == position.y)
            })
            .or_else(|| {
                map.entities.iter().filter(valid).find(|entity| {
                    (entity.x - position.x).abs() + (entity.y - position.y).abs() == 1
                })
            })
            .cloned();
        let Some(entity) = entity else { return };
        if !conditions(&save.flags, &entity.requires) {
            let line = if entity.locked.is_empty() {
                "Come back when you're ready.".to_owned()
            } else {
                entity.locked.clone()
            };
            self.simple_talk(&entity.name, line);
            return;
        }
        let battle_key = format!("won:{}/{}", position.map, entity.id);
        if save.flags.get(&battle_key) == Some(&true) {
            if !entity.after.is_empty() && self.open_dialogue(&entity.after, Some(entity.clone())) {
                return;
            }
            if entity.kind == "minigame" {
                self.activate(&entity, "minigame");
                return;
            }
            self.simple_talk(
                &entity.name,
                "You earned your place on this circuit.".into(),
            );
            return;
        }
        if entity.kind == "item" {
            let save = self.save.as_mut().unwrap();
            add_item(save, &entity.item, entity.quantity);
            save.flags
                .insert(format!("taken:{}/{}", save.position.map, entity.id), true);
            save.flags.extend(entity.sets);
            self.notice = format!(
                "Picked up {} ×{}.",
                self.world.items[&entity.item].name, entity.quantity
            );
            return;
        }
        if !entity.dialogue.is_empty() && self.open_dialogue(&entity.dialogue, Some(entity.clone()))
        {
            return;
        }
        self.activate(&entity, &entity.kind);
    }

    fn simple_talk(&mut self, speaker: &str, line: String) {
        self.talk = Some(Talk {
            speaker: speaker.into(),
            lines: vec![line],
            choices: vec![],
            sets: Flags::new(),
            entity: None,
        });
    }

    fn open_dialogue(&mut self, id: &str, entity: Option<Entity>) -> bool {
        let save = self.save.as_ref().unwrap();
        let Some(branch) = self.world.dialogues.get(id).and_then(|branches| {
            branches
                .iter()
                .find(|branch| conditions(&save.flags, &branch.when))
        }) else {
            return false;
        };
        let mut sets = branch.sets.clone();
        if let Some(entity) = entity
            .as_ref()
            .filter(|entity| entity.kind == "npc" && entity.squad.is_empty())
        {
            sets.extend(entity.sets.clone());
        }
        self.talk = Some(Talk {
            speaker: entity
                .as_ref()
                .map(|entity| entity.name.clone())
                .unwrap_or_else(|| "Dockside".into()),
            lines: branch.lines.clone(),
            choices: branch
                .choices
                .iter()
                .filter(|choice| conditions(&save.flags, &choice.when))
                .cloned()
                .collect(),
            sets,
            entity,
        });
        true
    }

    fn choose(&mut self, index: usize) {
        let Some(talk) = self.talk.as_ref() else {
            return;
        };
        let Some(choice) = talk.choices.get(index).cloned() else {
            return;
        };
        let talk = self.talk.take().unwrap();
        let save = self.save.as_mut().unwrap();
        save.flags.extend(talk.sets);
        save.flags.extend(choice.sets);
        if self.world.items.contains_key(&choice.give) {
            add_item(save, &choice.give, 1);
        }
        if let Some(entity) = &talk.entity {
            if !choice.action.is_empty() {
                self.activate(entity, &choice.action);
            }
        }
        if !choice.next.is_empty() {
            self.open_dialogue(&choice.next, talk.entity);
        }
    }

    fn activate(&mut self, entity: &Entity, action: &str) {
        let save = self.save.as_mut().unwrap();
        match action {
            "battle" | "label" | "rival" | "boss" | "wild" => {
                let key = format!("won:{}/{}", save.position.map, entity.id);
                if save.flags.get(&key) == Some(&true) {
                    return;
                }
                let squad: Vec<_> = entity
                    .squad
                    .iter()
                    .filter(|entry| conditions(&save.flags, &entry.when))
                    .cloned()
                    .collect();
                let mut sets = entity.sets.clone();
                sets.insert(key.clone(), true);
                start_battle(
                    &self.world,
                    save,
                    &entity.name,
                    &key,
                    &squad,
                    entity.reward,
                    sets,
                    entity.kind == "wild",
                );
            }
            "shop" => {
                self.shop = Some(entity.clone());
                save.flags.extend(entity.sets.clone());
            }
            "heal" => {
                heal_all(&self.world, save);
                save.checkpoint = save.position.clone();
                save.flags.extend(entity.sets.clone());
                self.simple_talk(
                    &entity.name,
                    "Your crew is back at full strength. Take the stage.".into(),
                );
            }
            "starter" => {
                if save.starter_locked {
                    self.notice = "Your first crew is already on the circuit.".into();
                } else {
                    self.starters = true;
                }
            }
            "minigame" => {
                if entity.kind == "minigame" && valid_track(&entity.track) {
                    self.minigame = Some(entity.clone());
                }
            }
            "exit" => {
                if let Some(destination) = &entity.destination {
                    if accessible(&self.world, save, destination) {
                        save.position = destination.clone();
                        save.flags.extend(entity.sets.clone());
                    }
                }
            }
            _ => {
                save.flags.extend(entity.sets.clone());
            }
        }
    }

    fn finish_minigame(&mut self, score: u32, accuracy: u8, cleared: bool) {
        let Some(entity) = self.minigame.take() else {
            return;
        };
        let save = self.save.as_mut().unwrap();
        let key = format!("{}/{}", save.position.map, entity.id);
        let best = save.scores.entry(key.clone()).or_default();
        let record = score > *best;
        if record {
            *best = score;
        }
        if !cleared {
            self.notice = format!(
                "{} kept the crowd this time. Come back and run it back.",
                entity.name
            );
            return;
        }
        let won_key = format!("won:{key}");
        let first = save.flags.get(&won_key) != Some(&true);
        let mut lines = vec![format!("You won the stage duel against {}!", entity.name)];
        if first {
            save.money = save.money.saturating_add(entity.reward);
            save.flags.insert(won_key, true);
            save.flags.extend(entity.sets.clone());
            if entity.reward > 0 {
                lines.push(format!("+{} credits.", entity.reward));
            }
        }
        let xp = 8 + u32::from(accuracy.min(100)) / 4 + if first { 12 } else { 0 };
        if let Some(lead) = save.party.iter().position(|monster| monster.hp > 0) {
            lines.push(format!(
                "{} gained {xp} XP.",
                monster_name(&self.world, &save.party[lead])
            ));
            let monster = &mut save.party[lead];
            gain_xp(
                &self.world,
                monster,
                &mut save.seen,
                &mut save.owned,
                xp,
                &mut lines,
            );
        }
        if record && score > 0 {
            lines.push("New best score!".into());
        }
        self.notice = lines.join(" ");
    }

    fn select_starter(&mut self, id: &str) {
        let save = self.save.as_mut().unwrap();
        if !self.starters
            || save.starter_locked
            || !self.world.starters.iter().any(|starter| starter == id)
        {
            return;
        }
        if let Some(monster) = make_monster(&self.world, id, 5) {
            let previous = &save.party[0].species;
            save.owned.remove(previous);
            save.seen.remove(previous);
            save.owned.insert(id.into());
            save.seen.insert(id.into());
            save.party[0] = monster;
            self.notice = format!("{} joined your crew.", self.world.species[id].name);
        }
        self.starters = false;
    }

    fn trade(&mut self, id: &str, selling: bool) {
        let Some(shop) = &self.shop else { return };
        let Some(item) = self.world.items.get(id) else {
            return;
        };
        let save = self.save.as_mut().unwrap();
        if selling {
            if item.price == 0 || save.bag.get(id).copied().unwrap_or(0) == 0 {
                return;
            }
            debit_item(save, id);
            save.money = save.money.saturating_add(item.price / 2);
            self.notice = format!("Sold {}.", item.name);
        } else if shop.stock.iter().any(|stock| stock == id) {
            if save.money < item.price {
                self.notice = "You need more credits for that.".into();
                return;
            }
            if save.bag.get(id).copied() == Some(u16::MAX) {
                return;
            }
            save.money -= item.price;
            add_item(save, id, 1);
            self.notice = format!("Bought {}.", item.name);
        }
    }

    fn transfer(&mut self, index: usize, withdraw: bool) {
        let save = self.save.as_mut().unwrap();
        if save.battle.is_some() || !save.starter_locked {
            return;
        }
        if withdraw && save.party.len() < 6 && index < save.reserve.len() {
            save.party.push(save.reserve.remove(index));
        } else if !withdraw
            && save.party.len() > 1
            && index < save.party.len()
            && save
                .party
                .iter()
                .enumerate()
                .any(|(slot, monster)| slot != index && monster.hp > 0)
        {
            save.reserve.push(save.party.remove(index));
        }
    }

    fn use_move(&mut self, index: usize) {
        let save = self.save.as_mut().unwrap();
        let Some(mut battle) = save.battle.take() else {
            return;
        };
        let player = &save.party[battle.active];
        if player.hp == 0 || choose_flow(&self.world, player, index).is_none() {
            save.battle = Some(battle);
            return;
        }
        let foe = &battle.enemies[battle.enemy];
        let enemy_pick = enemy_move(&self.world, foe, player);
        let player_flow = choose_flow(&self.world, player, index).unwrap();
        let enemy_flow = choose_flow(&self.world, foe, enemy_pick).unwrap_or_else(fallback);
        let first = (
            player_flow.priority,
            speed(&self.world, player, battle.tempo),
        ) >= (
            enemy_flow.priority,
            speed(&self.world, foe, battle.enemy_tempo),
        );
        battle.log.clear();
        battle.turn = battle.turn.saturating_add(1);
        strike(
            &self.world,
            save,
            &mut battle,
            first,
            if first { index } else { enemy_pick },
        );
        if save.party[battle.active].hp > 0 && battle.enemies[battle.enemy].hp > 0 {
            strike(
                &self.world,
                save,
                &mut battle,
                !first,
                if first { enemy_pick } else { index },
            );
        }
        residual(&self.world, save, &mut battle);
        self.notice = finish_turn(&self.world, save, battle);
    }

    fn switch(&mut self, index: usize) {
        let save = self.save.as_mut().unwrap();
        if !save.party.get(index).is_some_and(|monster| monster.hp > 0) {
            return;
        }
        let Some(mut battle) = save.battle.take() else {
            save.party.swap(0, index);
            return;
        };
        if index == battle.active {
            save.battle = Some(battle);
            return;
        }
        let forced = save.party[battle.active].hp == 0;
        battle.active = index;
        battle.tempo = 0;
        battle.log = vec![format!(
            "{} takes the mic!",
            monster_name(&self.world, &save.party[index])
        )];
        if !forced {
            retaliate(&self.world, save, &mut battle);
        }
        self.notice = finish_turn(&self.world, save, battle);
    }

    fn flee(&mut self) {
        let save = self.save.as_mut().unwrap();
        let Some(mut battle) = save.battle.take() else {
            return;
        };
        if !battle.wild {
            self.notice = "You can only run from a wild session.".into();
            save.battle = Some(battle);
            return;
        }
        let player = &save.party[battle.active];
        let foe = &battle.enemies[battle.enemy];
        let chance = if speed(&self.world, player, battle.tempo)
            >= speed(&self.world, foe, battle.enemy_tempo)
        {
            100
        } else {
            65
        };
        if roll(save, 100) < chance {
            self.notice = "You left the session.".into();
        } else {
            battle.log = vec!["The wild Freestylomon keeps the session going!".into()];
            retaliate(&self.world, save, &mut battle);
            self.notice = finish_turn(&self.world, save, battle);
        }
    }

    fn use_item(&mut self, id: &str, index: usize) {
        let Some(item) = self.world.items.get(id) else {
            return;
        };
        let save = self.save.as_mut().unwrap();
        if save.bag.get(id).copied().unwrap_or(0) == 0 {
            return;
        }
        if save
            .battle
            .as_ref()
            .is_some_and(|battle| save.party[battle.active].hp == 0)
        {
            self.notice = "Send out a new crewmate first.".into();
            return;
        }
        if item.effect == "capture" {
            let Some(mut battle) = save.battle.take() else {
                self.notice = "Use a Demo Tape in a wild battle.".into();
                return;
            };
            if !battle.wild {
                self.notice = "Only wild Freestylomon can be signed.".into();
                save.battle = Some(battle);
                return;
            }
            debit_item(save, id);
            let enemy = &battle.enemies[battle.enemy];
            let percent_missing = 100 - u32::from(enemy.hp) * 100 / u32::from(enemy.max_hp);
            let mut chance = u32::from(self.world.species[&enemy.species].catch_rate)
                + percent_missing / 2
                + u32::from(item.amount);
            if !enemy.status.is_empty() {
                chance += 13;
            }
            let enemy = enemy.clone();
            if roll(save, 100) < chance.clamp(4, 96) {
                let name = monster_name(&self.world, &enemy);
                save.owned.insert(enemy.species.clone());
                save.flags.extend(battle.sets);
                if save.party.len() < 6 {
                    save.party.push(enemy);
                    self.notice = format!("Signed {name}! They joined your crew.");
                } else {
                    save.reserve.push(enemy);
                    self.notice = format!("Signed {name}! They’re waiting in your reserve.");
                }
            } else {
                battle.log = vec!["The demo didn’t land!".into()];
                retaliate(&self.world, save, &mut battle);
                self.notice = finish_turn(&self.world, save, battle);
            }
            return;
        }
        if item.effect == "repel" && save.battle.is_none() {
            save.repel = item.amount;
        } else {
            let Some(monster) = save.party.get_mut(index) else {
                return;
            };
            match item.effect.as_str() {
                "heal" if monster.hp > 0 && monster.hp < monster.max_hp => {
                    monster.hp = monster.hp.saturating_add(item.amount).min(monster.max_hp);
                }
                "revive" if monster.hp == 0 => {
                    monster.hp = ((u32::from(monster.max_hp) * u32::from(item.amount) / 100)
                        as u16)
                        .clamp(1, monster.max_hp);
                    monster.status.clear();
                }
                "cleanse" if monster.hp > 0 && !monster.status.is_empty() => {
                    monster.status.clear();
                }
                "restore"
                    if monster.hp > 0
                        && monster
                            .moves
                            .iter()
                            .any(|slot| slot.pp < self.world.moves[&slot.id].pp) =>
                {
                    for slot in &mut monster.moves {
                        slot.pp = slot
                            .pp
                            .saturating_add(item.amount.min(255) as u8)
                            .min(self.world.moves[&slot.id].pp);
                    }
                }
                "held" if save.battle.is_none() => {
                    let previous = std::mem::replace(&mut monster.held, id.into());
                    if !previous.is_empty() {
                        add_item(save, &previous, 1);
                    }
                }
                "teach"
                    if save.battle.is_none()
                        && !monster.moves.iter().any(|slot| slot.id == item.flow) =>
                {
                    if monster.moves.len() == 4 {
                        monster.moves.remove(0);
                    }
                    monster.moves.push(MoveSlot {
                        id: item.flow.clone(),
                        pp: self.world.moves[&item.flow].pp,
                    });
                }
                _ => {
                    self.notice = "That item has no effect here.".into();
                    return;
                }
            }
        }
        debit_item(save, id);
        let message = format!("Used {}.", item.name);
        if let Some(mut battle) = save.battle.take() {
            battle.log = vec![message];
            retaliate(&self.world, save, &mut battle);
            self.notice = finish_turn(&self.world, save, battle);
        } else {
            self.notice = message;
        }
    }
}

fn monster_name<'a>(world: &'a World, monster: &Monster) -> &'a str {
    &world.species[&monster.species].name
}

fn start_battle(
    world: &World,
    save: &mut Save,
    name: &str,
    source: &str,
    squad: &[Encounter],
    reward: u32,
    sets: Flags,
    wild: bool,
) {
    let enemies: Vec<_> = squad
        .iter()
        .filter_map(|entry| make_monster(world, &entry.species, entry.level))
        .collect();
    let Some(foe) = enemies.first() else { return };
    let Some(active) = save.party.iter().position(|monster| monster.hp > 0) else {
        return;
    };
    save.seen.insert(foe.species.clone());
    save.starter_locked = true;
    let log = if wild {
        format!("A wild {} steps into the circle!", monster_name(world, foe))
    } else {
        format!("{name} calls out {}!", monster_name(world, foe))
    };
    save.battle = Some(Battle {
        name: if wild {
            "Wild session".into()
        } else {
            name.into()
        },
        source: source.into(),
        wild,
        enemies,
        enemy: 0,
        active,
        reward,
        sets,
        log: vec![log],
        turn: 1,
        tempo: 0,
        enemy_tempo: 0,
    });
}

fn fallback() -> Move {
    Move {
        name: "Off the Dome".into(),
        style: "".into(),
        description: "An improvised bar.".into(),
        power: 19,
        accuracy: 100,
        pp: 1,
        effect: "".into(),
        chance: 0,
        priority: 0,
    }
}

fn choose_flow(world: &World, monster: &Monster, index: usize) -> Option<Move> {
    if index == 999 && !monster.moves.iter().any(|slot| slot.pp > 0) {
        return Some(fallback());
    }
    let slot = monster.moves.get(index)?;
    (slot.pp > 0)
        .then(|| world.moves.get(&slot.id))
        .flatten()
        .cloned()
}

fn speed(world: &World, monster: &Monster, tempo: i8) -> i32 {
    let base = i32::from(world.species[&monster.species].speed)
        + i32::from(monster.level) * 2
        + i32::from(tempo) * 8;
    if monster.status == "stun" {
        base / 2
    } else {
        base
    }
}

fn matchup(world: &World, style: &str, defender: &Monster) -> u32 {
    let Some(attacking) = world.styles.get(style) else {
        return 2;
    };
    let defending = &world.species[&defender.species].style;
    if attacking.strong.contains(defending) {
        4
    } else if attacking.weak.contains(defending) {
        1
    } else {
        2
    }
}

fn enemy_move(world: &World, foe: &Monster, player: &Monster) -> usize {
    foe.moves
        .iter()
        .enumerate()
        .filter(|(_, slot)| slot.pp > 0)
        .max_by_key(|(_, slot)| {
            let flow = &world.moves[&slot.id];
            u32::from(flow.power) * matchup(world, &flow.style, player) * u32::from(flow.accuracy)
        })
        .map_or(999, |(index, _)| index)
}

fn strike(world: &World, save: &mut Save, battle: &mut Battle, player: bool, index: usize) {
    let attacking = if player {
        &save.party[battle.active]
    } else {
        &battle.enemies[battle.enemy]
    };
    let Some(flow) = choose_flow(world, attacking, index) else {
        return;
    };
    let stalled = attacking.status == "stun";
    let stun_roll = roll(save, 100);
    let accuracy = roll(save, 100);
    let critical = roll(save, 100) < 7;
    let effect_chance = roll(save, 100);
    let variation = 88 + roll(save, 13);
    let (attacking, defending, tempo) = if player {
        (
            &mut save.party[battle.active],
            &mut battle.enemies[battle.enemy],
            &mut battle.tempo,
        )
    } else {
        (
            &mut battle.enemies[battle.enemy],
            &mut save.party[battle.active],
            &mut battle.enemy_tempo,
        )
    };
    let name = monster_name(world, attacking);
    if stalled && stun_roll < 23 {
        battle.log.push(format!("{name} choked on the beat!"));
        return;
    }
    if let Some(slot) = attacking.moves.get_mut(index) {
        slot.pp -= 1;
    }
    battle.log.push(format!("{name} used {}!", flow.name));
    if accuracy >= u32::from(flow.accuracy) {
        battle.log.push("The bar missed.".into());
        return;
    }
    if flow.power > 0 {
        let attack =
            u64::from(world.species[&attacking.species].attack) + u64::from(attacking.level) * 2;
        let defense =
            u64::from(world.species[&defending.species].defense) + u64::from(defending.level) * 2;
        let effectiveness = matchup(world, &flow.style, defending);
        let held = world
            .items
            .get(&attacking.held)
            .map_or(0, |item| u64::from(item.amount));
        let base = (2 * u64::from(attacking.level) / 5 + 2) * u64::from(flow.power) * attack
            / defense.max(1)
            / 22
            + 2
            + held;
        let same_style = if world.species[&attacking.species].style == flow.style {
            120
        } else {
            100
        };
        let mut damage = base * u64::from(effectiveness * variation * same_style) / 20_000;
        if critical {
            damage = damage * 3 / 2;
            battle.log.push("Critical delivery!".into());
        }
        let damage = damage.clamp(1, u64::from(u16::MAX)) as u16;
        defending.hp = defending.hp.saturating_sub(damage);
        if effectiveness == 4 {
            battle.log.push("The style clash hits hard!".into());
        }
        if effectiveness == 1 {
            battle.log.push("The style muffles the hit.".into());
        }
        if flow.effect == "drain" {
            attacking.hp = attacking
                .hp
                .saturating_add(damage / 2)
                .min(attacking.max_hp);
        }
    }
    if effect_chance < u32::from(flow.chance) {
        match flow.effect.as_str() {
            "burn" | "stun" if defending.hp > 0 && defending.status.is_empty() => {
                defending.status.clone_from(&flow.effect);
                let consequence = if flow.effect == "burn" {
                    "is hoarse"
                } else {
                    "lost the beat"
                };
                battle
                    .log
                    .push(format!("{} {consequence}!", monster_name(world, defending)));
            }
            "tempo" => {
                *tempo = (*tempo + 1).min(3);
                battle.log.push(format!("{name} picked up the tempo!"));
            }
            "heal" => {
                attacking.hp = attacking
                    .hp
                    .saturating_add(attacking.max_hp / 3)
                    .min(attacking.max_hp);
            }
            _ => {}
        }
    }
}

fn residual(world: &World, save: &mut Save, battle: &mut Battle) {
    for monster in [
        &mut save.party[battle.active],
        &mut battle.enemies[battle.enemy],
    ] {
        if monster.status == "burn" && monster.hp > 0 {
            monster.hp = monster.hp.saturating_sub((monster.max_hp / 12).max(1));
            battle.log.push(format!(
                "{} took damage from hoarseness.",
                monster_name(world, monster)
            ));
        }
    }
}

fn retaliate(world: &World, save: &mut Save, battle: &mut Battle) {
    battle.turn = battle.turn.saturating_add(1);
    let index = enemy_move(
        world,
        &battle.enemies[battle.enemy],
        &save.party[battle.active],
    );
    strike(world, save, battle, false, index);
    residual(world, save, battle);
}

fn finish_turn(world: &World, save: &mut Save, mut battle: Battle) -> String {
    if !save.party.iter().any(|monster| monster.hp > 0) {
        save.position = save.checkpoint.clone();
        let loss = save.money / 5;
        save.money -= loss;
        heal_all(world, save);
        return format!(
            "Your crew lost the set. Rested at your checkpoint and paid {loss} credits."
        );
    }
    if battle.enemies[battle.enemy].hp == 0 {
        let enemy = &battle.enemies[battle.enemy];
        let xp = 12 + u32::from(enemy.level) * 6;
        battle.log.push(format!(
            "{} dropped the mic. +{xp} XP!",
            monster_name(world, enemy)
        ));
        let player = &mut save.party[battle.active];
        gain_xp(
            world,
            player,
            &mut save.seen,
            &mut save.owned,
            xp,
            &mut battle.log,
        );
        if battle.enemy + 1 == battle.enemies.len() {
            save.money = save.money.saturating_add(battle.reward);
            save.flags.extend(battle.sets);
            let result = if battle.wild {
                "Session won!".to_owned()
            } else {
                format!(
                    "Set won against {}. +{} credits!",
                    battle.name, battle.reward
                )
            };
            return format!(
                "{result} {}",
                battle
                    .log
                    .iter()
                    .skip_while(|line| !line.contains("XP!"))
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ")
            );
        }
        battle.enemy += 1;
        battle.enemy_tempo = 0;
        let next = &battle.enemies[battle.enemy];
        save.seen.insert(next.species.clone());
        battle
            .log
            .push(format!("{} takes the mic!", monster_name(world, next)));
    }
    if save.party[battle.active].hp == 0 {
        battle.log.push(format!(
            "{} dropped the mic. Choose a crewmate.",
            monster_name(world, &save.party[battle.active])
        ));
    }
    save.battle = Some(battle);
    String::new()
}

fn gain_xp(
    world: &World,
    monster: &mut Monster,
    seen: &mut BTreeSet<String>,
    owned: &mut BTreeSet<String>,
    xp: u32,
    log: &mut Vec<String>,
) {
    monster.xp = monster.xp.saturating_add(xp);
    while monster.level < 100 && monster.xp >= u32::from(monster.level) * 12 {
        monster.xp -= u32::from(monster.level) * 12;
        monster.level += 1;
        let species = &world.species[&monster.species];
        log.push(format!("{} reached level {}!", species.name, monster.level));
        if let Some(evolution) = species
            .evolves
            .as_ref()
            .filter(|evolution| monster.level >= evolution.at)
        {
            monster.species.clone_from(&evolution.into);
            seen.insert(monster.species.clone());
            owned.insert(monster.species.clone());
            log.push(format!(
                "{} evolved into {}!",
                species.name,
                monster_name(world, monster)
            ));
        }
        let new_species = &world.species[&monster.species];
        let old_hp = monster.max_hp;
        monster.max_hp = max_hp(new_species, monster.level);
        if monster.hp > 0 {
            monster.hp = monster
                .hp
                .saturating_add(monster.max_hp.saturating_sub(old_hp))
                .min(monster.max_hp);
        }
        for learn in new_species
            .learns
            .iter()
            .filter(|learn| learn.at == monster.level)
        {
            if monster.moves.iter().any(|slot| slot.id == learn.move_id) {
                continue;
            }
            if monster.moves.len() == 4 {
                monster.moves.remove(0);
            }
            let flow = &world.moves[&learn.move_id];
            log.push(format!("{} learned {}!", new_species.name, flow.name));
            monster.moves.push(MoveSlot {
                id: learn.move_id.clone(),
                pp: flow.pp,
            });
        }
    }
}
