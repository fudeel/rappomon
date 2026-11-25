use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub type Flags = BTreeMap<String, bool>;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct World {
    pub start: Spawn,
    pub starter: String,
    pub starters: Vec<String>,
    pub maps: BTreeMap<String, Map>,
    pub tiles: BTreeMap<String, Tile>,
    pub species: BTreeMap<String, Species>,
    pub moves: BTreeMap<String, Move>,
    pub items: BTreeMap<String, Item>,
    pub styles: BTreeMap<String, Style>,
    pub dialogues: BTreeMap<String, Vec<Dialogue>>,
    pub objectives: Vec<Objective>,
    #[serde(default)]
    pub initial_flags: Flags,
    #[serde(default)]
    pub initial_bag: BTreeMap<String, u16>,
}

impl Default for World {
    fn default() -> Self {
        serde_json::from_str(include_str!("../data/world.json"))
            .expect("bundled world is valid JSON")
    }
}

impl World {
    pub fn validate(&self) -> Result<(), String> {
        let plain = |position: &Spawn| {
            self.maps
                .get(&position.map)
                .and_then(|map| map.tile_at(position.x, position.y))
                .and_then(|tile| self.tiles.get(&tile))
                .is_some_and(|tile| !tile.blocked)
        };
        let known_encounter = |entry: &Encounter| {
            self.species.contains_key(&entry.species) && (1..=100).contains(&entry.level)
        };
        if !plain(&self.start)
            || !self.species.contains_key(&self.starter)
            || self.starters.is_empty()
            || self
                .starters
                .iter()
                .any(|id| !self.species.contains_key(id))
        {
            return Err("World needs a walkable start and valid starter species.".into());
        }
        if self.maps[&self.start.map].entities.iter().any(|entity| {
            entity.solid
                && entity.x == self.start.x
                && entity.y == self.start.y
                && entity.when.iter().all(|(flag, expected)| {
                    self.initial_flags.get(flag).copied().unwrap_or(false) == *expected
                })
        }) {
            return Err(
                "The new-game start is occupied. Move the entity or choose another start tile."
                    .into(),
            );
        }
        if self.tiles.keys().any(|id| !id.is_ascii() || id.len() != 1) {
            return Err("Tile IDs must be single ASCII characters.".into());
        }
        for (id, map) in &self.maps {
            let width = map.rows.first().map_or(0, String::len);
            if !(4..=160).contains(&width)
                || !(4..=160).contains(&map.rows.len())
                || map.rows.iter().any(|row| {
                    row.len() != width
                        || row
                            .chars()
                            .any(|tile| !self.tiles.contains_key(&tile.to_string()))
                })
                || map.encounter_rate > 100
                || !map.encounters.iter().all(known_encounter)
            {
                return Err(format!(
                    "Map {id} has invalid dimensions, tiles, or encounters."
                ));
            }
            let mut entity_ids = BTreeSet::new();
            for entity in &map.entities {
                if entity.id.is_empty()
                    || !entity_ids.insert(&entity.id)
                    || map.tile_at(entity.x, entity.y).is_none()
                {
                    return Err(format!(
                        "Entity {} on {id} needs a unique ID and an in-bounds position.",
                        entity.id
                    ));
                }
                if ![
                    "npc", "shop", "heal", "starter", "label", "rival", "boss", "item", "exit",
                    "decor", "light", "wild",
                ]
                .contains(&entity.kind.as_str())
                    || (entity.kind == "item"
                        && (!self.items.contains_key(&entity.item) || entity.quantity == 0))
                    || (entity.kind == "exit" && !entity.destination.as_ref().is_some_and(plain))
                    || (entity.kind == "light"
                        && (!(0.2..=32.0).contains(&entity.radius)
                            || !(0.0..=1.0).contains(&entity.strength)))
                    || !entity.squad.iter().all(known_encounter)
                    || entity
                        .stock
                        .iter()
                        .any(|item| !self.items.contains_key(item))
                    || [&entity.dialogue, &entity.after]
                        .iter()
                        .any(|key| !key.is_empty() && !self.dialogues.contains_key(*key))
                {
                    return Err(format!(
                        "Entity {} on {id} has an invalid kind, setting, or reference.",
                        entity.id
                    ));
                }
            }
        }
        for (id, species) in &self.species {
            if species.hp == 0
                || !self.styles.contains_key(&species.style)
                || species.catch_rate > 100
                || !species.learns.iter().any(|learn| learn.at == 1)
                || species.learns.iter().any(|learn| {
                    !(1..=100).contains(&learn.at) || !self.moves.contains_key(&learn.move_id)
                })
                || species.evolves.as_ref().is_some_and(|evolution| {
                    !(2..=100).contains(&evolution.at)
                        || !self.species.contains_key(&evolution.into)
                })
            {
                return Err(format!(
                    "Species {id} has invalid stats or catalog references."
                ));
            }
        }
        for (id, flow) in &self.moves {
            if !self.styles.contains_key(&flow.style)
                || flow.pp == 0
                || flow.accuracy > 100
                || flow.chance > 100
                || !["", "burn", "stun", "tempo", "heal", "drain"].contains(&flow.effect.as_str())
            {
                return Err(format!("Flow {id} has invalid stats or style."));
            }
        }
        for (id, style) in &self.styles {
            if style
                .strong
                .iter()
                .chain(&style.weak)
                .any(|key| !self.styles.contains_key(key))
            {
                return Err(format!("Style {id} references a missing style."));
            }
        }
        for (id, item) in &self.items {
            if ![
                "capture", "heal", "revive", "cleanse", "restore", "repel", "held", "teach",
            ]
            .contains(&item.effect.as_str())
                || (item.effect == "revive" && !(1..=100).contains(&item.amount))
                || (item.effect == "teach" && !self.moves.contains_key(&item.flow))
            {
                return Err(format!("Item {id} has an invalid effect or amount."));
            }
        }
        for (id, branches) in &self.dialogues {
            if branches.is_empty()
                || branches.iter().any(|branch| {
                    branch.lines.is_empty()
                        || branch.choices.iter().any(|choice| {
                            (!choice.next.is_empty() && !self.dialogues.contains_key(&choice.next))
                                || (!choice.give.is_empty()
                                    && !self.items.contains_key(&choice.give))
                        })
                })
            {
                return Err(format!(
                    "Dialogue {id} requires at least one line per branch and valid references."
                ));
            }
        }
        if self
            .initial_bag
            .keys()
            .any(|id| !self.items.contains_key(id))
        {
            return Err("Starting bag references a missing item.".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Spawn {
    pub map: String,
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Map {
    pub name: String,
    pub subtitle: String,
    pub rows: Vec<String>,
    #[serde(default)]
    pub entities: Vec<Entity>,
    #[serde(default)]
    pub encounters: Vec<Encounter>,
    #[serde(default = "encounter_rate")]
    pub encounter_rate: u8,
}

fn encounter_rate() -> u8 {
    17
}

impl Map {
    pub fn tile_at(&self, x: i32, y: i32) -> Option<String> {
        let row = self.rows.get(usize::try_from(y).ok()?)?;
        Some(row.chars().nth(usize::try_from(x).ok()?)?.to_string())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Tile {
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub blocked: bool,
    #[serde(default)]
    pub encounters: bool,
    #[serde(default)]
    pub art: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Entity {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    #[serde(default)]
    pub art: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub solid: bool,
    #[serde(default)]
    pub when: Flags,
    #[serde(default)]
    pub requires: Flags,
    #[serde(default)]
    pub sets: Flags,
    #[serde(default)]
    pub dialogue: String,
    #[serde(default)]
    pub locked: String,
    #[serde(default)]
    pub after: String,
    #[serde(default)]
    pub item: String,
    #[serde(default = "one")]
    pub quantity: u16,
    #[serde(default)]
    pub squad: Vec<Encounter>,
    #[serde(default)]
    pub stock: Vec<String>,
    #[serde(default)]
    pub destination: Option<Spawn>,
    #[serde(default)]
    pub reward: u32,
    #[serde(default = "light_radius")]
    pub radius: f64,
    #[serde(default = "light_strength")]
    pub strength: f64,
    #[serde(default)]
    pub beam: bool,
}

fn one() -> u16 {
    1
}
fn light_radius() -> f64 {
    4.0
}
fn light_strength() -> f64 {
    0.35
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Encounter {
    pub species: String,
    pub level: u8,
    #[serde(default)]
    pub when: Flags,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Species {
    pub name: String,
    pub style: String,
    pub art: String,
    pub color: String,
    pub description: String,
    pub hp: u16,
    pub attack: u16,
    pub defense: u16,
    pub speed: u16,
    pub catch_rate: u8,
    pub learns: Vec<Learn>,
    #[serde(default)]
    pub evolves: Option<Evolution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Learn {
    pub at: u8,
    #[serde(rename = "move")]
    pub move_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Evolution {
    pub at: u8,
    pub into: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Style {
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub strong: Vec<String>,
    #[serde(default)]
    pub weak: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Move {
    pub name: String,
    pub style: String,
    pub description: String,
    pub power: u16,
    pub accuracy: u8,
    pub pp: u8,
    #[serde(default)]
    pub effect: String,
    #[serde(default)]
    pub chance: u8,
    #[serde(default)]
    pub priority: i8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Item {
    pub name: String,
    pub description: String,
    pub effect: String,
    pub amount: u16,
    pub price: u32,
    pub icon: String,
    #[serde(default)]
    pub flow: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Dialogue {
    #[serde(default)]
    pub when: Flags,
    pub lines: Vec<String>,
    #[serde(default)]
    pub choices: Vec<Choice>,
    #[serde(default)]
    pub sets: Flags,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Choice {
    pub label: String,
    #[serde(default)]
    pub when: Flags,
    #[serde(default)]
    pub sets: Flags,
    #[serde(default)]
    pub next: String,
    #[serde(default)]
    pub give: String,
    #[serde(default)]
    pub action: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Objective {
    pub name: String,
    pub detail: String,
    pub flag: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Save {
    pub position: Spawn,
    pub facing: String,
    pub party: Vec<Monster>,
    pub reserve: Vec<Monster>,
    pub bag: BTreeMap<String, u16>,
    pub flags: Flags,
    pub money: u32,
    pub seen: BTreeSet<String>,
    pub owned: BTreeSet<String>,
    pub steps: u32,
    pub repel: u16,
    pub rng: u32,
    pub battle: Option<Battle>,
    pub checkpoint: Spawn,
    #[serde(default)]
    pub starter_locked: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Monster {
    pub species: String,
    pub level: u8,
    pub xp: u32,
    pub hp: u16,
    pub max_hp: u16,
    pub moves: Vec<MoveSlot>,
    pub status: String,
    pub held: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MoveSlot {
    pub id: String,
    pub pp: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Battle {
    pub name: String,
    pub source: String,
    pub wild: bool,
    pub enemies: Vec<Monster>,
    pub enemy: usize,
    pub active: usize,
    pub reward: u32,
    pub sets: Flags,
    pub log: Vec<String>,
    pub turn: u32,
    pub tempo: i8,
    pub enemy_tempo: i8,
}

#[derive(Clone, Debug, Serialize)]
pub struct Talk {
    pub speaker: String,
    pub lines: Vec<String>,
    pub choices: Vec<Choice>,
    #[serde(skip)]
    pub sets: Flags,
    #[serde(skip)]
    pub entity: Option<Entity>,
}
