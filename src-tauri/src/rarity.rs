//! Pity-modified rarity roll. Each failed higher-tier roll increments a pity
//! counter, increasing the next roll's probability up to a per-tier cap.
//! Rates: Legendary 1/200 (cap 5), Epic 1/50 (cap 4), Rare 1/20 (cap 4), Uncommon 1/8 (cap 4).
use crate::state::PityCounters;

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
/// Returns the rarity and updates pity counters in place.
pub fn roll_rarity(pity: &mut PityCounters) -> Rarity {
    roll_rarity_with_rng(pity, &mut rand::thread_rng())
}

/// Inner implementation accepting any RNG — used directly in tests for deterministic results.
fn roll_rarity_with_rng<R: rand::Rng>(pity: &mut PityCounters, rng: &mut R) -> Rarity {
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

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::SmallRng;
    use rand::SeedableRng;

    #[test]
    fn rarity_as_str_all_variants() {
        assert_eq!(Rarity::Common.as_str(), "common");
        assert_eq!(Rarity::Uncommon.as_str(), "uncommon");
        assert_eq!(Rarity::Rare.as_str(), "rare");
        assert_eq!(Rarity::Epic.as_str(), "epic");
        assert_eq!(Rarity::Legendary.as_str(), "legendary");
    }

    #[test]
    fn pity_counters_never_exceed_cap() {
        let mut rng = SmallRng::seed_from_u64(42);
        let mut pity = PityCounters::default();
        for _ in 0..10_000 {
            roll_rarity_with_rng(&mut pity, &mut rng);
            assert!(
                pity.legendary <= LEGENDARY_PARAMS.cap,
                "legendary pity {} > cap {}",
                pity.legendary,
                LEGENDARY_PARAMS.cap
            );
            assert!(
                pity.epic <= EPIC_PARAMS.cap,
                "epic pity {} > cap {}",
                pity.epic,
                EPIC_PARAMS.cap
            );
            assert!(
                pity.rare <= RARE_PARAMS.cap,
                "rare pity {} > cap {}",
                pity.rare,
                RARE_PARAMS.cap
            );
            assert!(
                pity.uncommon <= UNCOMMON_PARAMS.cap,
                "uncommon pity {} > cap {}",
                pity.uncommon,
                UNCOMMON_PARAMS.cap
            );
        }
    }

    #[test]
    fn legendary_pity_resets_to_zero_on_hit() {
        let mut rng = SmallRng::seed_from_u64(99);
        let mut pity = PityCounters::default();
        for _ in 0..100_000 {
            let r = roll_rarity_with_rng(&mut pity, &mut rng);
            if r == Rarity::Legendary {
                assert_eq!(
                    pity.legendary, 0,
                    "legendary pity must reset to 0 after a hit"
                );
                return;
            }
        }
        panic!("Never rolled legendary in 100 000 attempts — probability logic broken");
    }

    #[test]
    fn epic_pity_resets_to_zero_on_hit() {
        let mut rng = SmallRng::seed_from_u64(7);
        let mut pity = PityCounters::default();
        for _ in 0..50_000 {
            let r = roll_rarity_with_rng(&mut pity, &mut rng);
            if r == Rarity::Epic {
                assert_eq!(pity.epic, 0, "epic pity must reset to 0 after a hit");
                return;
            }
        }
        panic!("Never rolled epic in 50 000 attempts");
    }

    #[test]
    fn all_rarities_are_reachable() {
        let mut rng = SmallRng::seed_from_u64(99_999);
        let mut seen = std::collections::HashSet::new();
        let mut pity = PityCounters::default();
        for _ in 0..100_000 {
            seen.insert(roll_rarity_with_rng(&mut pity, &mut rng).as_str());
        }
        for tier in &["common", "uncommon", "rare", "epic", "legendary"] {
            assert!(
                seen.contains(tier),
                "tier '{tier}' was never rolled in 100 000 attempts"
            );
        }
    }

    #[test]
    fn legendary_base_rate_within_expected_bounds() {
        // Base rate: 1/200 = 0.5%. Over 50 000 independent rolls (fresh pity each time),
        // expect ~250 legendaries. Allowed range [100, 500] covers many standard deviations.
        let mut rng = SmallRng::seed_from_u64(12_345);
        let mut count = 0u32;
        for _ in 0..50_000 {
            let mut pity = PityCounters::default();
            if roll_rarity_with_rng(&mut pity, &mut rng) == Rarity::Legendary {
                count += 1;
            }
        }
        assert!(count > 100 && count < 500,
            "Legendary count {count} outside expected range [100, 500] for 50 000 rolls at 0.5% base rate");
    }

    #[test]
    fn max_pity_increases_legendary_rate() {
        // At max legendary pity (cap=5), rate = 5/200 = 2.5%, 5× the base rate.
        // Run both scenarios with same seed split to compare counts.
        let n = 20_000u32;
        let mut rng = SmallRng::seed_from_u64(777);
        let (mut no_pity, mut max_pity) = (0u32, 0u32);

        for _ in 0..n {
            let mut pity = PityCounters::default();
            if roll_rarity_with_rng(&mut pity, &mut rng) == Rarity::Legendary {
                no_pity += 1;
            }
        }
        for _ in 0..n {
            let mut pity = PityCounters {
                legendary: LEGENDARY_PARAMS.cap,
                ..PityCounters::default()
            };
            if roll_rarity_with_rng(&mut pity, &mut rng) == Rarity::Legendary {
                max_pity += 1;
            }
        }

        assert!(
            max_pity > no_pity,
            "Max pity ({max_pity}) should yield more legendaries than no pity ({no_pity})"
        );
    }
}
