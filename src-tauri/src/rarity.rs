use crate::state::PityCounters;
use rand::Rng;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Rarity {
    Common,
    Uncommon,
    Rare,
    Epic,
    Legendary,
}

impl Rarity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Rarity::Common => "common",
            Rarity::Uncommon => "uncommon",
            Rarity::Rare => "rare",
            Rarity::Epic => "epic",
            Rarity::Legendary => "legendary",
        }
    }
}

struct TierParams {
    base_num: u32,
    base_den: u32,
    cap: u32,
}

const LEGENDARY_PARAMS: TierParams = TierParams {
    base_num: 1,
    base_den: 200,
    cap: 5,
};
const EPIC_PARAMS: TierParams = TierParams {
    base_num: 1,
    base_den: 50,
    cap: 4,
};
const RARE_PARAMS: TierParams = TierParams {
    base_num: 1,
    base_den: 20,
    cap: 4,
};
const UNCOMMON_PARAMS: TierParams = TierParams {
    base_num: 1,
    base_den: 8,
    cap: 4,
};

/// Roll for rarity using top-down check with incremental pity.
/// Returns the rarity and updated pity counters.
pub fn roll_rarity(pity: &mut PityCounters) -> Rarity {
    let mut rng = rand::thread_rng();

    // Legendary check
    let leg_prob = (LEGENDARY_PARAMS.base_num + pity.legendary).min(LEGENDARY_PARAMS.cap);
    if rng.gen_ratio(leg_prob, LEGENDARY_PARAMS.base_den) {
        pity.legendary = 0;
        return Rarity::Legendary;
    }
    pity.legendary = (pity.legendary + 1).min(LEGENDARY_PARAMS.cap);

    // Epic check
    let epic_prob = (EPIC_PARAMS.base_num + pity.epic).min(EPIC_PARAMS.cap);
    if rng.gen_ratio(epic_prob, EPIC_PARAMS.base_den) {
        pity.epic = 0;
        return Rarity::Epic;
    }
    pity.epic = (pity.epic + 1).min(EPIC_PARAMS.cap);

    // Rare check
    let rare_prob = (RARE_PARAMS.base_num + pity.rare).min(RARE_PARAMS.cap);
    if rng.gen_ratio(rare_prob, RARE_PARAMS.base_den) {
        pity.rare = 0;
        return Rarity::Rare;
    }
    pity.rare = (pity.rare + 1).min(RARE_PARAMS.cap);

    // Uncommon check
    let uncommon_prob = (UNCOMMON_PARAMS.base_num + pity.uncommon).min(UNCOMMON_PARAMS.cap);
    if rng.gen_ratio(uncommon_prob, UNCOMMON_PARAMS.base_den) {
        pity.uncommon = 0;
        return Rarity::Uncommon;
    }
    pity.uncommon = (pity.uncommon + 1).min(UNCOMMON_PARAMS.cap);

    // Fallback: Common
    Rarity::Common
}
