import { describe, expect, it } from "vitest";
import { renderDigest } from "../src/digest/render";
import type { DigestData } from "../src/digest/types";

const me = { email: "sam@example.org", unsubscribeUrl: "https://eelsdb.eu/digest/unsubscribe/TOKEN/" };

const MONTHS: Record<string, DigestData> = {
 "burst": {
  "month": "2026-10",
  "news": [
   {
    "slug": "corex-gas-phase-spectra",
    "title": "Gas-phase spectra from Corex are now on EELSdb",
    "summary": "Adam Hitchcock's Corex collection of gas-phase inner-shell spectra is now part of EELSdb: 666 spectra of molecules, searchable alongside the solid-state data.",
    "published_at": "2026-10-28T10:00:00Z"
   }
  ],
  "spectra": 666,
  "totals": {
   "spectra": 956,
   "contributors": 42
  },
  "elements": {
   "C": 631,
   "H": 541,
   "O": 337,
   "N": 211,
   "F": 120,
   "Si": 77,
   "S": 57,
   "Cl": 36,
   "Fe": 25,
   "B": 21,
   "Co": 15,
   "Mn": 12,
   "P": 8,
   "Ti": 8,
   "Ge": 6,
   "Cr": 5,
   "Ni": 5,
   "V": 4,
   "Br": 3,
   "Re": 3,
   "Se": 3,
   "Mg": 1,
   "Ne": 1,
   "Zn": 1
  },
  "newEdges": [
   {
    "element": "F",
    "edge": "K",
    "n": 49
   },
   {
    "element": "Cl",
    "edge": "L2,3",
    "n": 12
   },
   {
    "element": "Si",
    "edge": "L1",
    "n": 5
   },
   {
    "element": "Cl",
    "edge": "L1",
    "n": 2
   },
   {
    "element": "Ge",
    "edge": "M2,3",
    "n": 2
   },
   {
    "element": "Ne",
    "edge": "K",
    "n": 1
   },
   {
    "element": "P",
    "edge": "L1",
    "n": 1
   },
   {
    "element": "Se",
    "edge": "M2,3",
    "n": 1
   },
   {
    "element": "Se",
    "edge": "M4,5",
    "n": 1
   }
  ],
  "groups": [
   {
    "name": "Adam Hitchcock",
    "slug": "adam-hitchcock",
    "count": 666,
    "kinds": [
     {
      "phase": "gas",
      "type": "coreloss",
      "n": 666
     }
    ],
    "spectra": [
     {
      "slug": "biuret-c-k-gas",
      "title": "Biuret",
      "formula": "C2H5N3O2",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 275.1564,
      "max_energy_ev": 339.718,
      "edges": [
       {
        "element": "C",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Corex file BU-0CCKK.OS, reference code LC&07.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": {
       "text": "Chemical Physics 331 (2007) 289",
       "doi": null
      }
     },
     {
      "slug": "urea-o-k-gas",
      "title": "Urea",
      "formula": "CH4N2O",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 524.3974,
      "max_energy_ev": 554.2889,
      "edges": [
       {
        "element": "O",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Structural formula: (NH2)2C=O. Corex file ur-0ookk.os, reference code UH&95b.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": {
       "text": "J. Pol. Sci. B. Pol. Phys. 33 (1995) 1603.",
       "doi": null
      }
     },
     {
      "slug": "alanine-n-k-gas",
      "title": "Alanine",
      "formula": "CH7NO2",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 392.0345,
      "max_energy_ev": 428.6745,
      "edges": [
       {
        "element": "N",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Structural formula: CH3CH(NH2)(COOH). Corex file AH-0NNKK.OS, reference code GH01.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": null
     },
     {
      "slug": "vinylfluoride-f-k-gas",
      "title": "Vinylfluoride",
      "formula": "C2FH3",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 671.4062,
      "max_energy_ev": 733.229,
      "edges": [
       {
        "element": "F",
        "edge": "K"
       }
      ],
      "newEdges": [
       {
        "element": "F",
        "edge": "K"
       }
      ],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Structural formula: CH2CHF. Corex file vf-0ffkk.os, reference code MI&87.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": {
       "text": "J.Chem.Phys. 87 (87) 4344.",
       "doi": null
      }
     },
     {
      "slug": "silylene-si-l2-3-gas",
      "title": "Silylene",
      "formula": "C10H20N2Si",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 90.04537,
      "max_energy_ev": 189.7525,
      "edges": [
       {
        "element": "Si",
        "edge": "L2,3"
       }
      ],
      "newEdges": [],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Structural formula: Si(NtBuCH=CHNtBu). Corex file uo-0sill.os, reference code UH+98.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": {
       "text": "Organometallics 17 (1998) 2352.",
       "doi": null
      }
     },
     {
      "slug": "thiophene-s-l2-3-s-l1-gas",
      "title": "Thiophene",
      "formula": "C4H4S",
      "type": "coreloss",
      "phase": "gas",
      "min_energy_ev": 160.267,
      "max_energy_ev": 290.211,
      "edges": [
       {
        "element": "S",
        "edge": "L2,3"
       },
       {
        "element": "S",
        "edge": "L1"
       }
      ],
      "newEdges": [],
      "description": "From Corex, the gas-phase core excitation database of A.P. Hitchcock and D.C. Mancini, McMaster University. Structural formula: c-C4H4S. Corex file ta-0ssl3.os, reference code HN&86.",
      "beam_energy_kv": null,
      "resolution_ev": 0.7,
      "reference": {
       "text": "J. Chem. Phys. 85 (86) 4849.",
       "doi": null
      }
     }
    ]
   }
  ]
 },
 "newsonly": {
  "month": "2026-09",
  "news": [
   {
    "slug": "new-website",
    "title": "EELSdb has a new website, with ORCID sign-in, a simpler upload form and faster search across every spectrum",
    "summary": "Every spectrum, account and page address from the old site has moved across. Sign in with ORCID, Google or GitHub, or with a link sent to your email.",
    "published_at": "2026-09-14T10:00:00Z"
   }
  ],
  "spectra": 0,
  "totals": {
   "spectra": 290,
   "contributors": 41
  },
  "elements": {},
  "newEdges": [],
  "groups": []
 },
 "pair": {
  "month": "2023-11",
  "news": [],
  "spectra": 2,
  "totals": {
   "spectra": 290,
   "contributors": 41
  },
  "elements": {
   "La": 2,
   "S": 2,
   "Ta": 2,
   "Y": 2
  },
  "newEdges": [],
  "groups": [
   {
    "name": "Simon Hettler",
    "slug": "simon",
    "count": 2,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 2
     }
    ],
    "spectra": [
     {
      "slug": "mlc-nanotube-ylas-tas2",
      "title": "MLC Nanotube (Y,La)S-TaS2",
      "formula": "((Y_{0.2} La{0.8})S)1.16-TaS_2",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 1700,
      "max_energy_ev": 2574,
      "edges": [
       {
        "element": "Y",
        "edge": "L2,3"
       },
       {
        "element": "S",
        "edge": "K"
       },
       {
        "element": "Ta",
        "edge": "M4,5"
       }
      ],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 300,
      "resolution_ev": 1.8,
      "reference": {
       "text": "Simon Hettler et al. (2020), ACS Nano",
       "doi": "10.1021/acsnano.9b09284"
      }
     },
     {
      "slug": "mlc-nanotube-y0-6la0-4s-tas2",
      "title": "MLC Nanotube (Y0.6La0.4)S-TaS2",
      "formula": "((Y_{0.6} La{0.4})S)1.18-TaS_2",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 1700,
      "max_energy_ev": 2574,
      "edges": [],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 300,
      "resolution_ev": 1.8,
      "reference": {
       "text": "Simon Hettler et al. (2020), ACS Nano",
       "doi": "10.1021/acsnano.9b09284"
      }
     }
    ]
   }
  ]
 },
 "quiet": {
  "month": "2022-05",
  "news": [
   {
    "slug": "compare-spectra",
    "title": "Compare up to six spectra in one plot",
    "summary": "Tick the spectra you want on any list and choose Compare. You can shift and scale each one, and download the plot as an image.",
    "published_at": "2022-05-24T10:00:00Z"
   },
   {
    "slug": "check-older-spectra",
    "title": "Help us fill in the details of older spectra",
    "summary": "Many spectra from the first years of EELSdb have no beam energy or resolution recorded. If you shared one of them, you can now add the missing details from your account.",
    "published_at": "2022-05-09T10:00:00Z"
   }
  ],
  "spectra": 7,
  "totals": {
   "spectra": 287,
   "contributors": 40
  },
  "elements": {
   "C": 7,
   "H": 7,
   "N": 3,
   "O": 1
  },
  "newEdges": [],
  "groups": [
   {
    "name": "Ruchi Pal",
    "slug": "ruchi-8118",
    "count": 7,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 7
     }
    ],
    "spectra": [
     {
      "slug": "polybutylene-terephthalate",
      "title": "Polybutylene terephthalate",
      "formula": "(C12H1204)n",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 259.12,
      "max_energy_ev": 326.07,
      "edges": [],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     },
     {
      "slug": "polypropylene",
      "title": "Polypropylene",
      "formula": "(C3H6)n",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 259.3,
      "max_energy_ev": 326.25,
      "edges": [
       {
        "element": "C",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     },
     {
      "slug": "polylactic-acid",
      "title": "Polylactic acid",
      "formula": "(C3H4O2)n",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 259.33,
      "max_energy_ev": 326.28,
      "edges": [
       {
        "element": "C",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     },
     {
      "slug": "polyethylene-hdpe",
      "title": "Polyethylene (HDPE)",
      "formula": "(C2H4)n",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 259.21,
      "max_energy_ev": 326.16,
      "edges": [
       {
        "element": "C",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     },
     {
      "slug": "styrene-acrylonitrile-copolymer-san-2",
      "title": "Styrene Acrylonitrile copolymer (SAN)",
      "formula": "(C8H8)n-(C3H3N)m",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 258.69,
      "max_energy_ev": 325.64,
      "edges": [],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     },
     {
      "slug": "acrylonitrile-butadiene-styrene-copolymer-abs",
      "title": "Acrylonitrile Butadiene Styrene copolymer (ABS)",
      "formula": "(C8H8.C4H6.C3H3N)n",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 259.53,
      "max_energy_ev": 326.48,
      "edges": [],
      "newEdges": [],
      "description": null,
      "beam_energy_kv": 120,
      "resolution_ev": 0.9,
      "reference": {
       "text": "doi:10.5281/zenodo.4840613",
       "doi": "10.5281/zenodo.4840613"
      }
     }
    ]
   }
  ]
 },
 "single": {
  "month": "2023-10",
  "news": [
   {
    "slug": "monthly-digest",
    "title": "The monthly digest is back",
    "summary": "EELSdb is sending a monthly email again, with the new spectra and news. It goes out only in months with something new.",
    "published_at": "2023-10-02T10:00:00Z"
   }
  ],
  "spectra": 1,
  "totals": {
   "spectra": 288,
   "contributors": 41
  },
  "elements": {
   "S": 1,
   "Ta": 1,
   "Y": 1
  },
  "newEdges": [
   {
    "element": "Y",
    "edge": "L1",
    "n": 1
   },
   {
    "element": "Y",
    "edge": "L2,3",
    "n": 1
   }
  ],
  "groups": [
   {
    "name": "Simon Hettler",
    "slug": "simon",
    "count": 1,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 1
     }
    ],
    "spectra": [
     {
      "slug": "mlc-nanotube-ys-tas2",
      "title": "MLC Nanotube YS-TaS2",
      "formula": "(YS)1.2-TaS2",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 1700,
      "max_energy_ev": 2574,
      "edges": [
       {
        "element": "Y",
        "edge": "L1"
       },
       {
        "element": "Y",
        "edge": "L2,3"
       },
       {
        "element": "Ta",
        "edge": "M4,5"
       },
       {
        "element": "S",
        "edge": "K"
       }
      ],
      "newEdges": [
       {
        "element": "Y",
        "edge": "L1"
       },
       {
        "element": "Y",
        "edge": "L2,3"
       }
      ],
      "description": null,
      "beam_energy_kv": 300,
      "resolution_ev": 1.8,
      "reference": {
       "text": "Simon Hettler et al. (2020), ACS Nano",
       "doi": "10.1021/acsnano.9b09284"
      }
     }
    ]
   }
  ]
 },
 "typical": {
  "month": "2008-01",
  "news": [],
  "spectra": 24,
  "totals": {
   "spectra": 156,
   "contributors": 22
  },
  "elements": {
   "O": 17,
   "Al": 8,
   "Y": 6,
   "Ti": 4,
   "Zn": 3,
   "Co": 2,
   "Cr": 2,
   "Ga": 2,
   "La": 2,
   "N": 2,
   "Si": 2,
   "V": 2,
   "C": 1,
   "Fe": 1,
   "S": 1,
   "Sr": 1
  },
  "newEdges": [
   {
    "element": "Co",
    "edge": "L1",
    "n": 1
   },
   {
    "element": "Co",
    "edge": "M2,3",
    "n": 1
   },
   {
    "element": "La",
    "edge": "N4,5",
    "n": 1
   },
   {
    "element": "S",
    "edge": "L1",
    "n": 1
   },
   {
    "element": "V",
    "edge": "L2,3",
    "n": 1
   },
   {
    "element": "Zn",
    "edge": "L1",
    "n": 1
   },
   {
    "element": "Zn",
    "edge": "L2,3",
    "n": 1
   },
   {
    "element": "Zn",
    "edge": "M2,3",
    "n": 1
   }
  ],
  "groups": [
   {
    "name": "Wilfried Sigle",
    "slug": "wsigle",
    "count": 14,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 9
     },
     {
      "phase": "solid",
      "type": "lowloss",
      "n": 5
     }
    ],
    "spectra": [
     {
      "slug": "zinc-oxide",
      "title": "Zinc oxide",
      "formula": "ZnO",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 415.11,
      "max_energy_ev": 1313.05,
      "edges": [
       {
        "element": "O",
        "edge": "K"
       },
       {
        "element": "Zn",
        "edge": "L1"
       },
       {
        "element": "Zn",
        "edge": "L2,3"
       }
      ],
      "newEdges": [
       {
        "element": "Zn",
        "edge": "L1"
       },
       {
        "element": "Zn",
        "edge": "L2,3"
       }
      ],
      "description": "Analyst: Wilfried Sigle. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": 1,
      "reference": null
     },
     {
      "slug": "aluminium-gallium-alloy-2",
      "title": "Aluminium gallium alloy",
      "formula": "Al(Ga)",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 55.2,
      "max_energy_ev": 189.1,
      "edges": [
       {
        "element": "Al",
        "edge": "L2,3"
       }
      ],
      "newEdges": [],
      "description": "Analyst: Wilfried Sigle. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": 0.6,
      "reference": null
     },
     {
      "slug": "yag-yttrium-aluminium-garnet",
      "title": "YAG (yttrium aluminium garnet)",
      "formula": "Y3Al5O12",
      "type": "lowloss",
      "phase": "solid",
      "min_energy_ev": -15.6,
      "max_energy_ev": 118.3,
      "edges": [],
      "newEdges": [],
      "description": "Analyst: Saso Sturm. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": 0.7,
      "reference": null
     },
     {
      "slug": "titanium",
      "title": "Titanium",
      "formula": "Ti",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 435,
      "max_energy_ev": 568.6,
      "edges": [
       {
        "element": "Ti",
        "edge": "L2,3"
       }
      ],
      "newEdges": [],
      "description": "Analyst: Zaoli Zhang. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": null,
      "reference": null
     }
    ]
   },
   {
    "name": "Ferdinand Hofer",
    "slug": "ferdinand-hofer",
    "count": 4,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 2
     },
     {
      "phase": "solid",
      "type": "lowloss",
      "n": 2
     }
    ],
    "spectra": [
     {
      "slug": "vanadium-oxide-2",
      "title": "vanadium oxide",
      "formula": "V2O5",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 518,
      "max_energy_ev": 538.46,
      "edges": [
       {
        "element": "V",
        "edge": "L2,3"
       }
      ],
      "newEdges": [
       {
        "element": "V",
        "edge": "L2,3"
       }
      ],
      "description": "Analyst: Gerald Kothleitner. Temperature: Room.",
      "beam_energy_kv": 200,
      "resolution_ev": 0.2,
      "reference": {
       "text": "D.S.Su, H.W.Zandbergen,P.C.Tiemeier,G.Kothleiner,et al.,Micron, 34, 235-238, 2003",
       "doi": null
      }
     },
     {
      "slug": "lanathanum-cobalt-oxide",
      "title": "Lanathanum Cobalt Oxide",
      "formula": "LaCoO3",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 455,
      "max_energy_ev": 966.5,
      "edges": [
       {
        "element": "O",
        "edge": "K"
       },
       {
        "element": "La",
        "edge": "M4,5"
       },
       {
        "element": "Co",
        "edge": "L2,3"
       },
       {
        "element": "Co",
        "edge": "L1"
       }
      ],
      "newEdges": [
       {
        "element": "Co",
        "edge": "L1"
       }
      ],
      "description": "Not calibrated Analyst: Irmgrad Rom, Ferdinand Hofer. Temperature: Room.",
      "beam_energy_kv": 200,
      "resolution_ev": 2,
      "reference": null
     }
    ]
   },
   {
    "name": "Saso Sturm",
    "slug": "saso-sturm",
    "count": 2,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 1
     },
     {
      "phase": "solid",
      "type": "lowloss",
      "n": 1
     }
    ],
    "spectra": [
     {
      "slug": "titanium-dioxide-rutile-structure-4",
      "title": "Titanium dioxide (rutile structure)",
      "formula": "TiO2",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 403.8,
      "max_energy_ev": 608,
      "edges": [
       {
        "element": "Ti",
        "edge": "L2,3"
       }
      ],
      "newEdges": [],
      "description": "Analyst: Saso Sturm. Temperature: Room.",
      "beam_energy_kv": 200,
      "resolution_ev": 1.2,
      "reference": null
     },
     {
      "slug": "titanium-dioxide-rutile-structure-3",
      "title": "Titanium dioxide (rutile structure)",
      "formula": "TiO2",
      "type": "lowloss",
      "phase": "solid",
      "min_energy_ev": -16.8,
      "max_energy_ev": 187.4,
      "edges": [],
      "newEdges": [],
      "description": "Analyst: Saso Sturm. Temperature: Room.",
      "beam_energy_kv": 200,
      "resolution_ev": 1.2,
      "reference": null
     }
    ]
   },
   {
    "name": "Vesna Srot",
    "slug": "vesna-srot",
    "count": 2,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 1
     },
     {
      "phase": "solid",
      "type": "lowloss",
      "n": 1
     }
    ],
    "spectra": [
     {
      "slug": "silicon-nitride-2",
      "title": "Silicon nitride",
      "formula": "Si3N4",
      "type": "coreloss",
      "phase": "solid",
      "min_energy_ev": 50,
      "max_energy_ev": 719.5,
      "edges": [
       {
        "element": "Si",
        "edge": "L2,3"
       },
       {
        "element": "N",
        "edge": "K"
       }
      ],
      "newEdges": [],
      "description": "not calibrated Analyst: Lingyang Li. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": 1,
      "reference": null
     },
     {
      "slug": "silicon-nitride",
      "title": "Silicon nitride",
      "formula": "Si3N4",
      "type": "lowloss",
      "phase": "solid",
      "min_energy_ev": -19,
      "max_energy_ev": 650.5,
      "edges": [],
      "newEdges": [],
      "description": "Analyst: Lingyang Li. Temperature: Room.",
      "beam_energy_kv": 100,
      "resolution_ev": 1,
      "reference": null
     }
    ]
   },
   {
    "name": "Andy Brown",
    "slug": "a-p-brown",
    "count": 1,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 1
     }
    ],
    "spectra": []
   },
   {
    "name": "Rik Brydson",
    "slug": "mtlrmdb",
    "count": 1,
    "kinds": [
     {
      "phase": "solid",
      "type": "coreloss",
      "n": 1
     }
    ],
    "spectra": []
   }
  ]
 }
};

const EXPECTED: Record<string, { subject: string; preheader: string }> = {
 "burst": {
  "subject": "EELSdb digest: Gas-phase spectra from Corex are now on EELSdb",
  "preheader": "666 new gas-phase core-loss spectra from Adam Hitchcock, including the first F K spectra on EELSdb."
 },
 "newsonly": {
  "subject": "EELSdb digest: September news",
  "preheader": "EELSdb has a new website, with ORCID sign-in, a simpler upload form and faster search across every spectrum."
 },
 "pair": {
  "subject": "EELSdb digest: 2 new spectra in November",
  "preheader": "Two new core-loss spectra from Simon Hettler: MLC Nanotube (Y,La)S-TaS2 and MLC Nanotube (Y0.6La0.4)S-TaS2."
 },
 "quiet": {
  "subject": "EELSdb digest: 2 news articles and 7 new spectra in May",
  "preheader": "Compare up to six spectra in one plot. Help us fill in the details of older spectra."
 },
 "single": {
  "subject": "EELSdb digest: The monthly digest is back",
  "preheader": "One new core-loss spectrum of (YS)1.2-TaS2, shared by Simon Hettler. It is the first spectrum of the Y L1 and Y L2,3 edges on EELSdb."
 },
 "typical": {
  "subject": "EELSdb digest: 24 new spectra in January",
  "preheader": "24 new spectra from Wilfried Sigle, Ferdinand Hofer and 4 others, including the first Co L1 spectrum on EELSdb."
 }
};

describe("renderDigest", () => {
  it.each(Object.keys(MONTHS))("%s: subject and preview text", (key) => {
    const r = renderDigest(MONTHS[key], me);
    expect(r.subject).toBe(EXPECTED[key].subject);
    expect(r.preheader).toBe(EXPECTED[key].preheader);
  });

  it("stays under Gmail's clipping limit for 666 spectra", () => {
    const { html } = renderDigest(MONTHS.burst, me);
    expect(new TextEncoder().encode(html).length).toBeLessThan(102 * 1024);
    expect(html).toContain("Browse all 666 new spectra");
    expect(html).toContain("https://eelsdb.eu/spectra/?sort=published_at&amp;order=desc");
    expect(html).toContain("https://eelsdb.eu/og/digest/tile/");
  });

  it("escapes content", () => {
    const d: DigestData = structuredClone(MONTHS.single);
    d.groups[0].spectra[0].title = `<script>alert("x")</script> & Co`;
    d.groups[0].spectra[0].reference = { text: "A <b>bold</b> & claim", doi: null };
    d.news = [{ slug: "x", title: "<i>Hi</i> & bye", summary: "Say <b>this</b>", published_at: "2022-05-24T10:00:00Z" }];
    const r = renderDigest(d, { email: `a"<b>@example.org`, unsubscribeUrl: "https://eelsdb.eu/u?a=1&b=2" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<b>bold");
    expect(r.html).not.toContain("<i>Hi");
    expect(r.html).not.toContain('a"<b>');
    expect(r.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
    expect(r.html).toContain("u?a=1&amp;b=2");
    expect(r.html).toContain("24 May 2022");
  });

  it("web version has no address, unsubscribe or browser link", () => {
    const r = renderDigest(MONTHS.quiet, null);
    for (const s of [r.html, r.text]) {
      expect(s).not.toMatch(/Sent to|Unsubscribe|sam@example/);
      expect(s).toContain("Email settings");
    }
    expect(r.html).not.toContain("View in a browser");
    const mine = renderDigest(MONTHS.quiet, me);
    expect(mine.html).toContain("Sent to sam@example.org.");
    expect(mine.html).toContain("https://eelsdb.eu/digest/2022-05/");
    expect(mine.text).toContain(`Unsubscribe: ${me.unsubscribeUrl}`);
  });

  it("text part has the news and the spectra", () => {
    const { text } = renderDigest(MONTHS.quiet, me);
    expect(text).toContain("Compare up to six spectra in one plot");
    expect(text).toContain("News, 24 May 2022");
    expect(text).toContain("Read the article: https://eelsdb.eu/news/compare-spectra/");
    expect(text).toContain("Ruchi Pal: 7 core-loss spectra");
    expect(text).toContain("https://eelsdb.eu/spectra/");
  });

  it("news-only month has no spectra heading", () => {
    const { html, text } = renderDigest(MONTHS.newsonly, me);
    expect(html).not.toMatch(/new spectr(um|a) in/);
    expect(html).not.toContain("Browse all");
    expect(html).toContain("Read the article");
    expect(text).not.toMatch(/new spectr(um|a) in/);
    expect(html).toContain("Have spectra of your own?");
  });

  it("uses cards up to three spectra, tiles and a periodic table beyond", () => {
    expect(renderDigest(MONTHS.pair, me).html).toContain("/og/digest/plot/");
    const big = renderDigest(MONTHS.typical, me).html;
    expect(big).not.toContain("/og/digest/plot/");
    expect(big).toContain("Also shared this month:");
    expect(big).toContain('class="pt"');
    expect(renderDigest(MONTHS.single, me).html).toContain("First Y L<sub");
  });
});
