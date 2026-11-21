// Storyboard for the demo lesson. Every cue references inventory IDs (see inventory.ts);
// cues without scientific content are marked `connective`.
import type { AppendixSection, Chapter, DetailView, FigureData } from "../../lib/types.ts";

const ATTR = "Schwaab et al. (2021), Nat. Commun. 12:6763, CC BY 4.0. Cropped from the original PDF.";

const fig = (n: number, width: number, height: number, alt: string, callouts: FigureData["callouts"]): FigureData => ({
  src: `/demo/fig${n}.png`,
  alt,
  width,
  height,
  figureRef: `F-${n}`,
  attribution: `Fig. ${n} from ${ATTR}`,
  callouts,
});

// ─────────────────────────── Intro (about 80 seconds) ───────────────────────────
export const intro: Chapter = {
  id: "intro",
  kind: "intro",
  title: "The paper in one minute",
  summary: "The question, one key finding, and the caveat you need to read it correctly.",
  scenes: [
    {
      id: "intro-city",
      type: "establishing",
      title: "From the street to orbit",
      question: "What is this study about?",
      establishing: {
        disclaimer: "Illustration, not study data",
        labels: [
          { key: "street", text: "Urban heat" },
          { key: "satellite", text: "293 European cities, seen from orbit", ref: "M-01" },
        ],
      },
      cues: [
        { text: "A hot summer day in a European city. Planting trees is a well-known way to ease urban heat.", refs: ["B-01"], focus: "street" },
        { text: "But do trees help equally everywhere?", refs: ["Q-01"], focus: "liftoff" },
        { text: "To find out, this study looked down from orbit, at the surface temperatures of 293 European cities.", refs: ["M-01"], focus: "satellite" },
      ],
    },
    {
      id: "intro-question",
      type: "question",
      title: "The question",
      question: "What did the researchers ask?",
      kicker: "The research question",
      headline: "Do urban trees cool every European city by the same amount?",
      cues: [{ text: "The question: do urban trees cool every European city by the same amount?", refs: ["Q-01"], focus: "headline" }],
    },
    {
      id: "intro-compare",
      type: "comparison",
      title: "Central versus Southern Europe",
      question: "How much cooler are tree-covered areas?",
      comparison: {
        axisLabel: "How much cooler than continuous urban fabric",
        unit: "K",
        min: 0,
        max: 12,
        ticks: [0, 4, 8, 12],
        rows: [
          { key: "central", label: "Central Europe", from: 8, to: 12, display: "8-12 K cooler", ref: "R-03", tone: "cool" },
          { key: "south", label: "Southern Europe", from: 0, to: 4, display: "0-4 K cooler", ref: "R-02", tone: "warm" },
        ],
        annotations: [{ key: "exception", at: 0, text: "A few southern cities: not cooler at all", ref: "R-05" }],
        basis:
          "Land surface temperature, not air temperature. Tree-covered areas compared with continuous urban fabric; averages for summer and hot extremes; satellite snapshot at about 10:15 a.m.",
        basisRef: "M-05",
      },
      cues: [
        { text: "Short answer: no. Trees were cooler than built-up land in most cities, but by very different amounts.", refs: ["R-01", "R-25"], focus: "axis" },
        { text: "Notice what is measured: land surface temperature. How hot surfaces are, seen from above. Not the air you feel.", refs: ["M-01", "L-12"], focus: "basis" },
        { text: "In Central Europe, tree-covered areas were on average 8 to 12 kelvin cooler than continuous urban fabric.", refs: ["R-03", "M-05"], focus: "central" },
        { text: "In Southern Europe, on the same scale, only 0 to 4 kelvin.", refs: ["R-02"], focus: "south" },
        { text: "And in a few southern cities, not cooler at all.", refs: ["R-05"], focus: "exception" },
      ],
    },
    {
      id: "intro-limits",
      type: "points",
      title: "Read it correctly",
      question: "What do you need to know to read that number correctly?",
      points: {
        items: [
          { key: "time", icon: "clock", title: "One morning snapshot", body: "About 10:15 a.m., cloud-free scenes only", ref: "M-06" },
          { key: "shade", icon: "shade", title: "No shade", body: "Seen from above; shade under trees is not included", ref: "L-17" },
          { key: "air", icon: "thermo", title: "Surface, not air", body: "Less directly linked to heat impacts than air temperature", ref: "L-12" },
          { key: "total", icon: "scale", title: "Not the total benefit", body: "Shows where trees cool surfaces most", ref: "L-18" },
        ],
      },
      cues: [
        { text: "One caveat. The satellite passes at about 10:15 a.m., and only cloud-free scenes count.", say: "One caveat. The satellite passes at about a quarter past ten in the morning, and only cloud-free scenes count.", refs: ["M-06", "L-04", "L-05"], focus: "time" },
        { text: "It sees surfaces from above. Shade under a tree is not in these numbers.", refs: ["L-17"], focus: "shade" },
        { text: "And surface temperature is less directly tied to the impacts of heat than air temperature.", refs: ["L-12"], focus: "air" },
        { text: "So this shows where trees cool surfaces most, not the total benefit of a tree on your street.", refs: ["L-18"], focus: "total" },
        { text: "That was the short version. Watch the full paper for methods, results and limits.", refs: [], connective: true },
      ],
    },
  ],
};

// ─────────────────────────── Chapters ───────────────────────────
export const chapters: Chapter[] = [
  {
    id: "ch-question",
    kind: "question",
    title: "The research question",
    summary: "What was unknown, and what exactly the study compares.",
    scenes: [
      {
        id: "q-gap",
        type: "points",
        title: "Why this was not known",
        question: "Why wasn't this known already?",
        points: {
          items: [
            { key: "how", icon: "leaf", title: "Shade and transpiration", body: "The two main ways trees influence city climate", ref: "B-06" },
            { key: "depends", icon: "sun", title: "It depends on conditions", body: "Season, heat extremes, regional climate", ref: "B-08" },
            { key: "blur", icon: "search", title: "City versus surroundings", body: "Hard to tell trees from treeless green spaces", ref: "B-03" },
            { key: "gap", icon: "scale", title: "The gap", body: "Hardly assessed systematically across climates", ref: "B-02" },
          ],
        },
        cues: [
          { text: "Trees influence city climate mainly in two ways: they cast shade, and they transpire water.", refs: ["B-06"], focus: "how" },
          { text: "How strongly that cools depends on the conditions around the tree: the season, heat extremes and the regional climate.", refs: ["B-08"], focus: "depends" },
          { text: "Many earlier studies compared whole cities with their surroundings. That makes it hard to tell trees apart from green spaces without trees.", refs: ["B-03"], focus: "blur" },
          { text: "So, based on observations, the cooling by urban trees had hardly been assessed systematically across different climates.", refs: ["B-02", "Q-01"], focus: "gap" },
        ],
      },
      {
        id: "q-setup",
        type: "points",
        title: "What is compared",
        question: "What exactly is compared with what?",
        points: {
          items: [
            { key: "uf", icon: "city", title: "Continuous urban fabric", body: "The reference surface in every comparison", ref: "M-05" },
            { key: "urban", icon: "tree", title: "In the city", body: "Urban trees, and urban green spaces without trees", ref: "M-03" },
            { key: "rural", icon: "leaf", title: "Outside the city", body: "Rural forests and rural pastures", ref: "M-03" },
            { key: "cooling", icon: "thermo", title: "Cooling", body: "A negative temperature difference to urban fabric", ref: "M-04" },
          ],
        },
        cues: [
          { text: "This study compares land covers directly. The reference is always continuous urban fabric.", refs: ["M-03", "M-05"], focus: "uf" },
          { text: "Against it stand urban trees, and urban green spaces without trees.", refs: ["M-03"], focus: "urban" },
          { text: "And, outside the cities, rural forests and rural pastures.", refs: ["M-03"], focus: "rural" },
          { text: "When vegetation is cooler than urban fabric, the temperature difference is negative. The paper calls that cooling.", refs: ["M-04"], focus: "cooling" },
        ],
      },
    ],
  },
  {
    id: "ch-method",
    kind: "method",
    title: "How the study was done",
    summary: "Where the satellite data come from, how tree effects are isolated, and why the observation time matters.",
    scenes: [
      {
        id: "m-data",
        type: "flow",
        title: "The data",
        question: "Where do the data come from?",
        flow: {
          steps: [
            { key: "cities", icon: "grid", title: "293 cities", detail: "A sample across Europe", facts: [{ text: "234 on a 50 km grid + 47 by hand + 12 metropolitan areas", ref: "M-10" }] },
            { key: "landsat", icon: "satellite", title: "Landsat surface temperature", detail: "2006-2018, 30 m resolution", facts: [{ text: "120,285 scenes", ref: "M-02" }, { text: "on average 408 per city", ref: "M-18" }] },
            { key: "landcover", icon: "layers", title: "Land cover", detail: "Copernicus Urban Atlas", facts: [{ text: "rasterised to 10 m", ref: "M-14" }] },
            { key: "trees", icon: "tree", title: "Tree layer", detail: "Copernicus Street Tree Layer", facts: [{ text: "patches of at least 500 m², at least 10 m wide", ref: "M-15" }] },
          ],
        },
        cues: [
          { text: "The study starts with a sample of 293 cities: 234 on a regular 50 kilometre grid, 47 added by hand where the grid was sparse, and 12 large metropolitan areas.", refs: ["M-10"], focus: "cities" },
          { text: "For each city, the team collected every Landsat scene from 2006 to 2018. That is 120,285 scenes in total, on average 408 per city, at 30 metre resolution.", refs: ["M-02", "M-18", "M-16"], focus: "landsat" },
          { text: "Land cover comes from the Copernicus Urban Atlas, which marks classes such as continuous urban fabric and green spaces.", refs: ["M-14"], focus: "landcover" },
          { text: "Trees come from a separate layer. It contains rows or patches of trees of at least 500 m², and at least 10 metres wide.", say: "Trees come from a separate layer. It contains rows or patches of trees of at least 500 square metres, and at least 10 metres wide.", refs: ["M-15"], focus: "trees" },
        ],
      },
      {
        id: "m-model",
        type: "figure",
        title: "Isolating the effect of trees",
        question: "How do you isolate the effect of trees?",
        figure: fig(5, 1176, 409, "Figure 5 of the paper: schematic of the modelling process from satellite observations to a smooth curve of temperature differences.", [
          { key: "data", label: "One model per satellite observation", x: 0.0, y: 0.02, w: 0.29, h: 0.96, ref: "M-30" },
          { key: "gam", label: "Model: temperature from land cover and terrain", x: 0.3, y: 0.02, w: 0.3, h: 0.96, ref: "M-25" },
          { key: "smooth", label: "Difference versus background temperature", x: 0.62, y: 0.02, w: 0.37, h: 0.96, ref: "M-32" },
          { key: "dot", label: "Hottest observation = hot extreme", x: 0.885, y: 0.1, w: 0.1, h: 0.3, ref: "M-32" },
        ]),
        cues: [
          { text: "To disentangle land cover from topography, the authors fit a statistical model: a generalized additive model, or GAM.", refs: ["M-08", "M-24", "F-5"], focus: "gam" },
          { text: "It is fitted separately for every city and for every single satellite observation.", refs: ["M-05", "M-30"], focus: "data" },
          { text: "Then the model answers a what-if question: how warm would a grid cell be with 100% trees, and how warm with 100% continuous urban fabric? The difference is the number you saw.", say: "Then the model answers a what-if question: how warm would a grid cell be with 100 percent trees, and how warm with 100 percent continuous urban fabric? The difference is the number you saw.", refs: ["M-25"], focus: "gam" },
          { text: "Each observation gives one difference. Plotted against the background temperature of that day, a smooth curve shows how cooling changes as it gets hotter.", refs: ["M-32", "M-07"], focus: "smooth" },
          { text: "The end of that curve, the hottest observation, is what the paper calls a hot extreme.", refs: ["M-32"], focus: "dot" },
          { text: "Note that this is an average effect over a whole city, not a map of single streets.", refs: ["M-28"] },
        ],
      },
      {
        id: "m-time",
        type: "timeline",
        title: "The observation time",
        question: "When does the satellite look, and why does that matter?",
        timeline: {
          from: 0,
          to: 24,
          marker: { at: 10.25, label: "Landsat over Europe, about 10:15 a.m.", ref: "M-19" },
          facts: [
            { key: "revisit", title: "Every 16 days", body: "One overpass per place", ref: "M-19" },
            { key: "uncertainty", title: "One snapshot, not the whole day", body: "More uncertainty, especially for hot extremes", ref: "L-04" },
            { key: "cloud", title: "Cloud-free only", body: "Cloudy days are missing", ref: "L-05" },
            { key: "surface", title: "Surface is hotter than air", body: "Daily maximum, clear and calm summer days: usually by several degrees", ref: "L-13" },
          ],
          disclaimer: "Schematic day. Only the overpass time is from the paper; no temperature curve is shown.",
        },
        cues: [
          { text: "Now the detail that shapes how to read every number. Landsat returns to the same place only every 16 days.", refs: ["M-19"], focus: "revisit" },
          { text: "It crosses the equator at about 10 a.m., so Europe is observed at roughly 10:15.", say: "It crosses the equator at about ten in the morning, so Europe is observed at roughly a quarter past ten.", refs: ["M-19", "M-06"], focus: "marker" },
          { text: "That is one mid-morning snapshot, not the whole day. The authors say this early time and the low temporal resolution increase uncertainty, especially for hot extremes.", refs: ["L-04"], focus: "uncertainty" },
          { text: "And only cloud-free scenes are usable, so cloudy days are missing.", refs: ["L-05"], focus: "cloud" },
          { text: "Keep in mind what is measured, too. On clear, calm summer days, the daily maximum surface temperature is usually several degrees above the air temperature.", refs: ["L-13"], focus: "surface" },
        ],
      },
    ],
  },
  {
    id: "ch-results",
    kind: "results",
    title: "What they found",
    summary: "Regional pattern, hot extremes, seasons, trees versus treeless green, and the role of water.",
    scenes: [
      {
        id: "r-map",
        type: "figure",
        title: "The regional pattern",
        question: "Where do trees cool surfaces most?",
        figure: fig(1, 975, 909, "Figure 1 of the paper: map of Europe with city dots coloured by temperature difference, surrounded by a ring of bars with country means.", [
          { key: "map", label: "Each dot is a city; darker blue = trees much cooler", x: 0.25, y: 0.3, w: 0.42, h: 0.42, ref: "F-1" },
          { key: "central", label: "Central Europe: -12 to -8 K", x: 0.52, y: 0.0, w: 0.4, h: 0.3, ref: "R-06" },
          { key: "south", label: "South: -4 to 0 K", x: 0.08, y: 0.08, w: 0.42, h: 0.3, ref: "R-07" },
        ]),
        cues: [
          { text: "This is Figure 1 of the paper: temperature differences between tree cover and continuous urban fabric during hot extremes.", refs: ["F-1"] },
          { text: "Each dot is a city. Darker blue means tree areas were much cooler than built-up areas.", refs: ["F-1"], focus: "map" },
          { text: "The ring shows country averages. Central Europe stands out: France, the Alps and Mid-Europe, the British Isles and Eastern Europe reach -8 to -12 K.", say: "The ring shows country averages. Central Europe stands out: France, the Alps and Mid-Europe, the British Isles and Eastern Europe reach minus 8 to minus 12 kelvin.", refs: ["R-06"], focus: "central" },
          { text: "Around the Mediterranean, in Turkey and on the Iberian Peninsula, the difference is small: 0 to -4 K.", say: "Around the Mediterranean, in Turkey and on the Iberian Peninsula, the difference is small: zero to minus 4 kelvin.", refs: ["R-07"], focus: "south" },
          { text: "In a few southern cities, such as Gaziantep, tree areas can even appear warmer than urban fabric.", refs: ["R-05", "R-40"], focus: "south" },
        ],
      },
      {
        id: "r-extremes",
        type: "map",
        title: "Hot extremes",
        question: "What changes when it gets really hot?",
        map: {
          regions: [
            { key: "scand", label: "Scandinavia", col: 6, row: 0, w: 4, h: 3, group: "north" },
            { key: "british", label: "British Isles", col: 1, row: 2, w: 3, h: 2, group: "central" },
            { key: "mid", label: "Mid-Europe / Alps", col: 4, row: 3, w: 3, h: 2, group: "central" },
            { key: "east", label: "Eastern Europe", col: 7, row: 3, w: 3, h: 2, group: "central" },
            { key: "france", label: "France", col: 2, row: 4, w: 2, h: 2, group: "central" },
            { key: "iberia", label: "Iberian Peninsula", col: 0, row: 6, w: 3, h: 2, group: "south" },
            { key: "med", label: "Mediterranean", col: 3, row: 6, w: 5, h: 2, group: "south" },
            { key: "turkey", label: "Turkey", col: 8, row: 6, w: 4, h: 2, group: "south" },
          ],
          groups: [
            { key: "central", label: "Central Europe", value: "-12 to -8 K in hot extremes", tone: "cool", ref: "R-06" },
            { key: "south", label: "Mediterranean, Turkey, Iberian Peninsula", value: "-4 to 0 K in hot extremes", tone: "warm", ref: "R-07" },
            { key: "north", label: "Scandinavia", value: "No range stated in the text; see Fig. 1", tone: "neutral", ref: "F-1" },
          ],
          states: {
            all: { regions: [], badge: "Hot extremes compared with an average summer" },
            weaker: { regions: ["turkey", "med", "iberia", "france", "east"], badge: "Cooling gets weaker in hot extremes", arrow: "down" },
            stronger: { regions: ["scand", "british", "mid"], badge: "Cooling is at times even stronger", arrow: "up" },
            north: { regions: ["scand", "british"], badge: "The strongest cooling moves north", arrow: "up" },
          },
          disclaimer: "Schematic region layout after Fig. 2b; not a geographic map and not drawn to scale.",
        },
        cues: [
          { text: "Hot extremes do not simply scale everything up. Compared with an average summer, the pattern shifts.", refs: ["R-28"], focus: "all" },
          { text: "In Turkey, the Mediterranean, the Iberian Peninsula, France and Eastern Europe, tree cooling gets weaker during hot extremes.", refs: ["R-08"], focus: "weaker" },
          { text: "In Scandinavia, the British Isles and parts of the Alps and Mid-Europe, it is at times even stronger.", refs: ["R-09"], focus: "stronger" },
          { text: "The strongest cooling moves north. The authors assume that there, the hot air draws more water from the trees, and the soil can still supply it.", refs: ["R-10", "R-39"], focus: "north" },
          { text: "This is why averaging over time can hide what happens in the moments that matter most.", refs: ["R-29"], focus: "all" },
        ],
      },
      {
        id: "r-seasons",
        type: "figure",
        title: "Seasons",
        question: "Does the season matter?",
        figure: fig(2, 975, 1139, "Figure 2 of the paper: maps of the selected cities and regions, and boxplots of temperature differences per season for nine cities.", [
          { key: "panelc", label: "Nine example cities, one box per season", x: 0.06, y: 0.45, w: 0.9, h: 0.53, ref: "F-2" },
          { key: "southcities", label: "Gaziantep, Antalya, Cordoba: spring is as strong as summer", x: 0.13, y: 0.47, w: 0.27, h: 0.36, ref: "R-11" },
          { key: "northcities", label: "Elsewhere: summer strongest, autumn weakest", x: 0.47, y: 0.47, w: 0.47, h: 0.36, ref: "R-12" },
        ]),
        cues: [
          { text: "Figure 2 zooms in on nine example cities. Each box shows the spread of differences in one season; the orange dot is the hottest observation.", refs: ["F-2"], focus: "panelc" },
          { text: "In southern and Turkish cities such as Gaziantep, Antalya and Cordoba, cooling in spring is higher than, or very close to, cooling in summer.", refs: ["R-11"], focus: "southcities" },
          { text: "Everywhere else, cooling peaks in summer. And autumn is the weakest season in all cities and regions.", refs: ["R-12"], focus: "northcities" },
        ],
      },
      {
        id: "r-green",
        type: "comparison",
        title: "Trees versus treeless green",
        question: "Is any green as good as trees?",
        comparison: {
          axisLabel: "Cooling relative to urban trees",
          unit: "x",
          min: 0,
          max: 1,
          ticks: [0, 0.25, 0.5, 1],
          rows: [
            { key: "trees", label: "Urban trees", from: 0, to: 1, display: "Reference = 1", ref: "C-03", tone: "cool" },
            { key: "green", label: "Green spaces without trees", from: 0.25, to: 0.5, display: "About 1/4 to 1/2", ref: "R-04", tone: "warm" },
          ],
          annotations: [{ key: "warm", at: 0, text: "South, especially Turkey: often warmer than urban fabric", ref: "R-18" }],
          basis: "Both compared with continuous urban fabric; land surface temperature.",
          basisRef: "R-16",
          derivedNote: "Drawn from the stated ratio (cooling 2-4 times lower). Not measured values for individual cities.",
        },
        cues: [
          { text: "What about urban green spaces without trees?", refs: ["R-04"], focus: "trees" },
          { text: "They cool too, but less: their effect is roughly 2 to 4 times lower than the cooling by urban trees.", refs: ["R-04", "C-03"], focus: "green" },
          { text: "That holds in every European region: treeless green always shows the smaller difference.", refs: ["R-16"], focus: "green" },
          { text: "In Southern Europe, and particularly in Turkey, treeless green spaces are often even warmer than urban fabric.", refs: ["R-18", "C-05"], focus: "warm" },
          { text: "The authors conclude that the type of vegetation matters, and that green spaces, especially in the south, should get more trees.", refs: ["R-41", "R-26"], focus: "trees" },
        ],
      },
      {
        id: "r-why",
        type: "figure",
        title: "The role of water",
        question: "Why is the south different?",
        figure: fig(4, 1176, 575, "Figure 4 of the paper: two scatterplots of temperature difference against evapotranspiration, one dot per city, with fitted lines.", [
          { key: "a", label: "Urban trees versus evapotranspiration of rural forest", x: 0.02, y: 0.02, w: 0.48, h: 0.96, ref: "R-22" },
          { key: "eq", label: "y = 0.187 - 3.13 x, R² = 0.46", x: 0.085, y: 0.09, w: 0.27, h: 0.1, ref: "FORM-1" },
          { key: "b", label: "Treeless green versus evapotranspiration of rural pastures", x: 0.5, y: 0.02, w: 0.49, h: 0.96, ref: "R-23" },
        ]),
        cues: [
          { text: "Why is the south different? Figure 4 plots each city's tree cooling against the evapotranspiration of nearby rural forest: the water that plants and soil give off.", refs: ["F-4", "R-22"], focus: "a" },
          { text: "The more water evaporates, the larger the cooling. The fitted line has an R² of 0.46, and the authors say evapotranspiration explains a large part of the variation.", say: "The more water evaporates, the larger the cooling. The fitted line has an R squared of 0.46, and the authors say evapotranspiration explains a large part of the variation.", refs: ["R-22", "FORM-1", "R-33"], focus: "eq" },
          { text: "In the south, especially on the Iberian Peninsula and in Turkey, evapotranspiration is much lower, which the authors link to limited soil moisture.", refs: ["R-20", "R-37"], focus: "a" },
          { text: "The same relationship holds for treeless green spaces and rural pastures.", refs: ["R-23"], focus: "b" },
          { text: "Albedo, the brightness of the surface, explains almost nothing between cities: R² below 0.1.", say: "Albedo, the brightness of the surface, explains almost nothing between cities: R squared below 0.1.", refs: ["R-24"] },
          { text: "One caveat: evapotranspiration data are usually not available inside cities, so the values come from forests and pastures outside.", refs: ["M-22"], focus: "a" },
        ],
      },
      {
        id: "r-rural",
        type: "figure",
        title: "City trees and rural forests",
        question: "Do city trees behave like forests?",
        figure: fig(3, 960, 509, "Figure 3 of the paper: boxplots of temperature differences by region for urban vegetation (left) and rural vegetation (right).", [
          { key: "a", label: "Inside cities: urban trees and green spaces", x: 0.0, y: 0.0, w: 0.5, h: 1, ref: "F-3" },
          { key: "b", label: "Outside cities: rural forests and pastures", x: 0.5, y: 0.0, w: 0.5, h: 1, ref: "R-13" },
        ]),
        cues: [
          { text: "Figure 3 compares vegetation inside cities, on the left, with vegetation outside, on the right.", refs: ["F-3"], focus: "a" },
          { text: "The regional patterns closely resemble each other, which indicates that similar processes are at work.", refs: ["R-13", "R-32"], focus: "b" },
          { text: "Region matters much more than whether a tree stands in the city or in the countryside.", refs: ["R-34"] },
          { text: "Still, there are differences. In Central Europe, urban trees cool more than rural forests. In Turkey it is the other way round.", refs: ["R-14"], focus: "a" },
        ],
      },
    ],
  },
  {
    id: "ch-limits",
    kind: "limits",
    title: "Limits and takeaways",
    summary: "What the study cannot tell us, and what to remember.",
    scenes: [
      {
        id: "l-limits",
        type: "points",
        title: "Limits of the study",
        question: "What can this study not tell us?",
        points: {
          items: [
            { key: "air", icon: "thermo", title: "Surface, not air", body: "Air-temperature differences are smaller", ref: "L-12" },
            { key: "shade", icon: "shade", title: "No shade", body: "Shading benefits are not reflected", ref: "L-17" },
            { key: "street", icon: "tree", title: "No single street trees", body: "Scattered trees and thin rows are mostly missing", ref: "L-09" },
            { key: "time", icon: "clock", title: "One morning snapshot", body: "About 10:15 a.m., cloud-free days", ref: "L-04" },
            { key: "city", icon: "city", title: "Patterns, not single cities", body: "Read single-city and absolute values with care", ref: "L-06" },
          ],
        },
        cues: [
          { text: "Now the limits, as the authors describe them. First: this is surface temperature. It is less directly linked to the harm heat does than air temperature.", refs: ["L-12"], focus: "air" },
          { text: "Differences in air temperature between forest and grassland are smaller than differences in surface temperature.", refs: ["L-14"], focus: "air" },
          { text: "Second: shade is missing. These satellite differences do not reflect the shading benefit of trees, which is particularly relevant in sunny Mediterranean regions.", refs: ["L-17"], focus: "shade" },
          { text: "Third: single street trees and thin rows of trees are mostly not in the tree data.", refs: ["L-09"], focus: "street" },
          { text: "Fourth: it is one mid-morning snapshot, on cloud-free days.", refs: ["L-04", "L-05"], focus: "time" },
          { text: "And fifth: the study shows large-scale patterns. Results for a single city, and absolute values, should be read with care.", refs: ["L-06"], focus: "city" },
        ],
      },
      {
        id: "l-takeaway",
        type: "points",
        title: "Takeaways",
        question: "What should you remember?",
        points: {
          items: [
            { key: "potential", icon: "check", title: "High potential", body: "Trees reduce surface heat in European cities", ref: "C-07" },
            { key: "depends", icon: "sun", title: "It depends", body: "On climate and on vegetation type", ref: "C-02" },
            { key: "extremes", icon: "thermo", title: "Hot extremes shift it", body: "Less in the south, more in the north", ref: "C-06" },
            { key: "manifold", icon: "shade", title: "More than one benefit", body: "Shade, wind and humidity matter on the street", ref: "L-01" },
            { key: "together", icon: "search", title: "Combine the evidence", body: "Satellites, stations and climate models", ref: "L-19" },
          ],
        },
        cues: [
          { text: "So what should you remember? The results confirm that trees have a high potential to mitigate urban heat in Europe.", refs: ["C-07"], focus: "potential" },
          { text: "But how much depends on the climate, and on the type of vegetation.", refs: ["C-02", "C-04"], focus: "depends" },
          { text: "During hot extremes, the reduction shrank in the Mediterranean and on the Iberian Peninsula, and grew in Scandinavia and the British Isles.", refs: ["C-06"], focus: "extremes" },
          { text: "The benefits of trees are manifold. Comfort on the street also depends on shade, wind and humidity.", refs: ["L-01"], focus: "manifold" },
          { text: "The authors suggest reading these results together with station measurements and climate models, because each approach has its own limits.", refs: ["L-19"], focus: "together" },
          { text: "And they highlight the need to investigate further how the effectiveness of heat measures depends on climate.", refs: ["C-01"], focus: "together" },
          { text: "Every statement in this lesson links to its place in the paper. Open the source index to check any of them.", refs: [], connective: true },
        ],
      },
    ],
  },
];

// ─────────────────────────── Detail views ───────────────────────────
export const details: DetailView[] = [
  { id: "d-background", title: "Background: what was known before", intro: "Context from the introduction that the video only touches on.", items: ["B-04", "B-05", "B-07", "B-09", "B-10", "B-11"] },
  { id: "d-domain", title: "Study area, regions and maps", intro: "Which cities and regions are covered and how maps and country means are built.", items: ["M-09", "M-11", "M-33"] },
  { id: "d-terrain", title: "Terrain and land-cover processing", intro: "Predictors next to land cover, and how treeless green is separated.", items: ["M-12", "M-13", "M-26"] },
  { id: "d-lst", title: "Surface temperature retrieval and ASTER", intro: "How emissivity is set and which second satellite data set was used for validation.", items: ["M-17", "M-20"] },
  { id: "d-et", title: "Albedo and evapotranspiration data", intro: "MODIS products, their resolution and their gaps.", items: ["M-21", "M-23", "R-21", "FORM-2", "L-03"] },
  { id: "d-model", title: "Statistical model details", intro: "Model terms, fit, sensitivity tests and what the model does not include.", items: ["M-27", "M-29", "M-31", "L-07", "L-08", "L-11"] },
  { id: "d-regional", title: "More regional results", intro: "Finer regional findings, including urban versus rural vegetation.", items: ["R-15", "R-17", "R-19", "R-27", "R-35", "R-36", "L-02"] },
  { id: "d-bio", title: "Biophysical explanations", intro: "Stomata, roots and surface roughness.", items: ["R-38", "R-42", "R-43", "L-10"] },
  { id: "d-outlook", title: "Outlook: drying, irrigation and air temperature", intro: "What the authors expect and what remains to be studied.", items: ["R-30", "R-31", "L-15", "L-16"] },
];

// ─────────────────────────── Source appendix ───────────────────────────
const refIds = Array.from({ length: 84 }, (_, k) => `REF-${String(k + 1).padStart(2, "0")}`);

export const appendix: AppendixSection[] = [
  { id: "a-figures", title: "All figures with captions", intro: "Every figure of the main article. Figures are also explained in the chapters.", items: ["F-1", "F-2", "F-3", "F-4", "F-5"] },
  { id: "a-formulas", title: "Formulas and tables", intro: "The main article has no numbered equations and no tables. These are the formula-like statements it contains.", items: ["FORM-1", "FORM-2", "M-17", "T-01"] },
  { id: "a-data", title: "Data and code availability", items: ["D-01", "D-02", "D-03"] },
  { id: "a-supplement", title: "Supplementary material (external)", intro: "Supplements are not part of the PDF. They are listed here with their own status and were not checked.", items: ["S-01", "S-02", "S-03", "S-04"] },
  { id: "a-article", title: "Article information and footnotes", items: ["X-01", "X-02", "X-03", "X-04", "X-05", "X-06", "X-07", "X-08", "X-09", "X-10", "X-11"] },
  { id: "a-references", title: "References (1-84)", intro: "The complete reference list, extracted from the PDF.", items: refIds },
];
