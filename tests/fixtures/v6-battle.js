// Captured from the committed v6 game, before quantity migration.
export const record = {
  "version": 6,
  "permanent": {
    "completedCycles": 0,
    "legacy": 0,
    "totalLegacy": 0,
    "upgrades": {
      "production": 0,
      "warfare": 0
    },
    "talents": {
      "autobuyer": 0,
      "logistics": 0,
      "formation": 0,
      "evolution": 0,
      "defense": 0,
      "elite": 0,
      "supply": 0,
      "salvage": 0,
      "conservation": 0,
      "challenge": 0,
      "continuity": 0
    },
    "talentGrants": [],
    "automation": {
      "unlocked": false,
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
    "runId": "v6-fixture",
    "challengeLevel": 0,
    "battleNumber": 1,
    "battleId": "v6-fixture:1",
    "phase": "battle",
    "processedBattleId": null,
    "settled": false,
    "earnedLegacy": 0,
    "upgrades": {
      "production": 0,
      "warfare": 0
    },
    "talents": {
      "autobuyer": 0,
      "logistics": 0,
      "formation": 0,
      "evolution": 0,
      "defense": 0,
      "elite": 0,
      "supply": 0,
      "salvage": 0,
      "conservation": 0,
      "challenge": 0,
      "continuity": 0
    },
    "autoElapsed": 0,
    "autoTurn": "recruit",
    "elapsed": 0,
    "extraBonuses": [
      {
        "target": {
          "stat": "health"
        },
        "type": "multiply",
        "value": 100000000,
        "source": {
          "id": "v6-test",
          "kind": "depth",
          "label": "旧版上限"
        }
      },
      {
        "target": {
          "stat": "baseHealth"
        },
        "type": "multiply",
        "value": 100000000,
        "source": {
          "id": "v6-test",
          "kind": "depth",
          "label": "旧版上限"
        }
      }
    ]
  },
  "game": {
    "status": "playing",
    "elapsed": 1.6666666666666656,
    "bases": {
      "player": {
        "team": "player",
        "x": 108,
        "hp": 999999975,
        "maxHp": 1000000000,
        "hitFlash": 0
      },
      "enemy": {
        "team": "enemy",
        "x": 1172,
        "hp": 1000000000,
        "maxHp": 1000000000,
        "hitFlash": 0
      }
    },
    "ages": {
      "player": 1,
      "enemy": 1
    },
    "experience": {
      "player": 0,
      "enemy": 0
    },
    "gold": {
      "player": 161.66666666666742,
      "enemy": 191.66666666666742
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
        "type": "melee",
        "x": 143.16666666666666,
        "hp": 1000000000,
        "attackCooldown": 0,
        "attackAnimation": 0,
        "hitFlash": 0,
        "moving": true,
        "distanceTravelled": 5.166666666666666,
        "chargeTravel": 5.166666666666666,
        "moveMultiplier": 1,
        "guardFlash": 0,
        "attackApproach": 0
      }
    ],
    "projectiles": [],
    "effects": [],
    "fields": [],
    "ability": {
      "type": "meteor",
      "x": 600,
      "remaining": 0.8,
      "wavesLeft": 1,
      "stats": {
        "name": "陨星天降",
        "cooldown": 40,
        "delay": 0.8,
        "radius": 140,
        "damage": 110,
        "baseDamage": 40,
        "waves": 1,
        "waveInterval": 0,
        "ignoreArmor": true,
        "description": "单次范围轰击 · 无视护甲",
        "enabled": true,
        "attackSpeed": 1
      }
    },
    "abilityCooldown": 40,
    "nextUnitId": 2,
    "nextOrderId": 2,
    "ai": {
      "enabled": false,
      "cooldown": 2.4,
      "orders": 0,
      "strategy": "balanced",
      "waves": 0
    },
    "mode": "incremental",
    "bonuses": [
      {
        "target": {
          "stat": "income",
          "team": "player"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "doctrine",
          "id": "production",
          "label": "生产档案"
        }
      },
      {
        "target": {
          "stat": "experience",
          "kind": "reward",
          "team": "player"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "doctrine",
          "id": "warfare",
          "label": "战争档案"
        }
      },
      {
        "target": {
          "stat": "startingGold",
          "team": "player"
        },
        "type": "add",
        "value": 0,
        "source": {
          "kind": "doctrine",
          "id": "supply",
          "label": "重建储备"
        }
      },
      {
        "target": {
          "stat": "bounty",
          "kind": "reward",
          "team": "player"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "doctrine",
          "id": "salvage",
          "label": "战利品回收"
        }
      },
      {
        "target": {
          "stat": "startingGold",
          "team": "enemy"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "income",
          "team": "enemy"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "experience",
          "team": "enemy",
          "kind": "reward"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "health",
          "team": "enemy"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "damage",
          "team": "enemy"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "baseHealth",
          "team": "enemy"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "kind": "challenge",
          "id": "challenge:0",
          "label": "挑战 0"
        }
      },
      {
        "target": {
          "stat": "legacy",
          "kind": "civilization"
        },
        "type": "add",
        "value": 0,
        "source": {
          "id": "conservation",
          "label": "遗产保存",
          "kind": "doctrine"
        }
      },
      {
        "target": {
          "stat": "legacy",
          "kind": "civilization"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "id": "continuity",
          "label": "文明传承",
          "kind": "doctrine"
        }
      },
      {
        "target": {
          "stat": "legacy",
          "kind": "civilization"
        },
        "type": "multiply",
        "value": 1,
        "source": {
          "id": "challenge:legacy",
          "label": "挑战遗产",
          "kind": "challenge"
        }
      },
      {
        "target": {
          "stat": "health"
        },
        "type": "multiply",
        "value": 100000000,
        "source": {
          "id": "v6-test",
          "kind": "depth",
          "label": "旧版上限"
        }
      },
      {
        "target": {
          "stat": "baseHealth"
        },
        "type": "multiply",
        "value": 100000000,
        "source": {
          "id": "v6-test",
          "kind": "depth",
          "label": "旧版上限"
        }
      }
    ]
  }
};
