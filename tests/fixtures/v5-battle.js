// Captured from the unmodified v5 simulator, with attacks in flight.
export const record = {
  "version": 5,
  "permanent": {
    "completedCycles": 8,
    "legacy": 3,
    "totalLegacy": 8,
    "upgrades": {
      "production": 0,
      "warfare": 0
    },
    "talents": {
      "autobuyer": 1,
      "logistics": 0,
      "formation": 0,
      "evolution": 0,
      "defense": 0,
      "elite": 0,
      "supply": 0,
      "salvage": 0,
      "conservation": 1,
      "challenge": 1,
      "continuity": 0
    },
    "talentGrants": [],
    "automation": {
      "unlocked": true,
      "enabled": false,
      "target": "front",
      "recruitEnabled": true,
      "mode": "single",
      "weights": [
        2,
        2,
        1
      ],
      "reserve": 0,
      "queueLimit": 5,
      "priority": "balanced",
      "evolve": false,
      "defense": false,
      "turretTarget": 0,
      "maxTurrets": 1,
      "expand": false,
      "replace": false,
      "elite": false,
      "eliteLimit": 1
    }
  },
  "run": {
    "runId": "4346c2a8-81be-4f15-a11b-d6073dd88f4e",
    "challengeLevel": 1,
    "battleNumber": 1,
    "battleId": "4346c2a8-81be-4f15-a11b-d6073dd88f4e:1",
    "phase": "battle",
    "processedBattleId": null,
    "settled": false,
    "earnedLegacy": 0,
    "upgrades": {
      "production": 0,
      "warfare": 0
    },
    "talents": {
      "autobuyer": 1,
      "logistics": 0,
      "formation": 0,
      "evolution": 0,
      "defense": 0,
      "elite": 0,
      "supply": 0,
      "salvage": 0,
      "conservation": 1,
      "challenge": 1,
      "continuity": 0
    },
    "autoElapsed": 0,
    "autoTurn": "recruit",
    "elapsed": 0
  },
  "game": {
    "status": "playing",
    "elapsed": 6.033333333333317,
    "bases": {
      "player": {
        "team": "player",
        "x": 108,
        "hp": 3800,
        "maxHp": 3800,
        "hitFlash": 0
      },
      "enemy": {
        "team": "enemy",
        "x": 1172,
        "hp": 4560,
        "maxHp": 4560,
        "hitFlash": 0
      }
    },
    "ages": {
      "player": 5,
      "enemy": 5
    },
    "experience": {
      "player": 2200,
      "enemy": 2200
    },
    "gold": {
      "player": 4637.200000000132,
      "enemy": 4713.220000000145
    },
    "queues": {
      "player": [],
      "enemy": []
    },
    "turrets": {
      "player": [
        null
      ],
      "enemy": [
        null
      ]
    },
    "units": [
      {
        "id": 1,
        "team": "player",
        "type": "warMachine",
        "x": 510,
        "hp": 1200,
        "attackCooldown": 1.8,
        "attackAnimation": 0.6,
        "hitFlash": 0,
        "moving": false,
        "distanceTravelled": 0.7666666666666666,
        "chargeTravel": 0,
        "moveMultiplier": 1,
        "guardFlash": 0,
        "attackApproach": 0
      },
      {
        "id": 2,
        "team": "enemy",
        "type": "warMachine",
        "x": 680,
        "hp": 1500,
        "attackCooldown": 1.8,
        "attackAnimation": 0.6,
        "hitFlash": 0,
        "moving": false,
        "distanceTravelled": 0.7666666666666666,
        "chargeTravel": 0,
        "moveMultiplier": 1,
        "guardFlash": 0,
        "attackApproach": 0
      }
    ],
    "projectiles": [
      {
        "team": "player",
        "kind": "plasma-orb",
        "fromX": 565,
        "toX": 680,
        "fromY": -46,
        "fromUnitX": 510,
        "toY": -38.480000000000004,
        "toOffsetX": 0,
        "targetId": 2,
        "targetBase": null,
        "damage": 235,
        "duration": 0.23958333333333334,
        "remaining": 0.23958333333333334,
        "splash": 90,
        "ignoreArmor": false,
        "armorPierce": 0,
        "pierce": 0,
        "originX": 565,
        "maxRange": "unbounded"
      },
      {
        "team": "enemy",
        "kind": "plasma-orb",
        "fromX": 625,
        "toX": 510,
        "fromY": -46,
        "fromUnitX": 680,
        "toY": -38.480000000000004,
        "toOffsetX": 0,
        "targetId": 1,
        "targetBase": null,
        "damage": 235,
        "duration": 0.23958333333333334,
        "remaining": 0.23958333333333334,
        "splash": 90,
        "ignoreArmor": false,
        "armorPierce": 0,
        "pierce": 0,
        "originX": 625,
        "maxRange": "unbounded"
      }
    ],
    "effects": [],
    "fields": [],
    "ability": null,
    "abilityCooldown": 0,
    "nextUnitId": 3,
    "nextOrderId": 3,
    "ai": {
      "enabled": false,
      "cooldown": 2.4,
      "orders": 0,
      "strategy": "balanced",
      "waves": 0
    },
    "mode": "incremental",
    "modifiers": {
      "income": 1,
      "experience": 1,
      "bounty": 1
    },
    "enemyModifiers": {
      "gold": 1.35,
      "income": 1.35,
      "experience": 1.2,
      "health": 1.25,
      "damage": 1.25,
      "baseHealth": 1.2
    }
  }
};
export const afterTwoSeconds = {
  "gold": {
    "player": 4709.200000000175,
    "enemy": 4810.420000000193
  },
  "experience": {
    "player": 2200,
    "enemy": 2200
  },
  "units": [
    {
      "team": "player",
      "hp": 928.25,
      "x": 510
    },
    {
      "team": "enemy",
      "hp": 1287,
      "x": 680
    }
  ],
  "bases": {
    "player": {
      "team": "player",
      "x": 108,
      "hp": 3800,
      "maxHp": 3800,
      "hitFlash": 0
    },
    "enemy": {
      "team": "enemy",
      "x": 1172,
      "hp": 4560,
      "maxHp": 4560,
      "hitFlash": 0
    }
  }
};
