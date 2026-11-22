# LearnLayla landing: a paper comes into focus

For curious learners who want to see what a paper actually says, the first screen has two jobs: join the waitlist or open a real lesson. Higgsfield is a reference for the cinematic framing and bold typography, not for assets, logos or copy.

The palette is projector black `#0a0d12`, panel ink `#151b23`, chalk `#f5f4ed`, muted slate `#b6bdc7`, Layla amber `#ffce65`, and cool tree green `#7dd8b2`. The display and body use the app's system sans stack; the artwork uses small technical labels with tabular numerals.

```text
Desktop: [ LearnLayla / nav                                   ]
         [ Watch the paper.  | Thermal-city illustration      ]
         [ What it does      | Play example / Source: p. 6    ]
         [ Early access form |                                ]
         [ Source / pacing / format strip                     ]
Mobile:  [ LearnLayla / nav ] → [ heading + signup ] → [ artwork + play ]
```

Considered a background video (high transfer cost and harder to read), a carousel (competes with signup), and a single illustrated film still (chosen). The still is a stylized illustration, not a data plot. It borrows the lesson's actual topic: tree cooling and land-surface temperature.

| Element | Motion | Meaning |
| --- | --- | --- |
| Illustrated city | A single slow push-in that settles in 1.8 s | Bring the subject into focus |
| Scene metadata | Brief reveal as the frame lands | Connect the image to the real lesson |
| Signup frame | A brief edge highlight on arrival and focus | Mark the primary action without moving the input |
| Submit button | Short hover movement; success swaps in place | Confirm the next interaction |

The final pose is the default composition. Reduced motion disables these animations; nothing autoplays or requires movement to understand. CSS is native and homepage-scoped because these are small UI effects, not a timeline player. The form still submits the existing data to the same Supabase waitlist.

## Second pass: Layla makes the rounds

The signature motion is a tiny robot guide banking around an illustrated city as if it were a physical set. A fixed mini-guide takes over as the set scrolls away. In contrast to the first pass, the movement never depends on catching a page-load reveal. The email field never moves.

- **Chosen: continuous character flight.** 10-second closed route; takeoff on the left, fast upper pass, turn at the right, dive toward the park, then a soft climb. Direction flips at the corners. The trail, propeller wing and city searchlight follow the same visual language.
- **Alternative: rendered trailer only.** Strong atmosphere but a video cannot hand off the guide as someone scrolls.
- **Alternative: cursor-following duck.** Rejected because it competes with the form and doesn't translate to touch.

The wider pitch remains two columns on desktop and stacks signup before the illustration on mobile. Deep aubergine `#110f22`, ink `#1c1a35`, warm white `#fff7e8`, amber `#ffcd70` and sea green `#8ff7d5` contrast the low-light set with Layla's playful details. The route stays inside the stage between the header and caption; the scroll companion is small, decorative and cannot intercept clicks. Looping motion has a pause control and is disabled with the system reduced-motion preference. Offscreen stage motion pauses automatically.

**Higgsfield Cinema Studio shot brief:** Use the project's Layla artwork as the character reference. An isometric miniature city at blue hour, copper windows, a mint-green park and indigo shadows. Single smooth tracking shot: the little cream-and-mint robot duck banks clockwise, skims above the trees, then returns to exactly the opening pose, camera position and lighting. No lettering, logos or additional characters. Landscape, silent, muted motion behind a readable caption. Render only in an authorized session; don't substitute other users' public clips or label the procedural web animation as Higgsfield footage.

## Showreel pass: follow a claim back to the page

Desktop: `[pitch + waitlist | Layla’s flight deck]` → `[Paper / Lesson / Source controls | corresponding preview]`. On mobile the waitlist and flight deck stack first, then the interactive strip. The existing aubergine, cream, amber and mint tokens carry through; the paper panel is the bright focal point below the fold.

We chose a guided, click-to-change walkthrough over an autoplay carousel or a second full-screen video. The paper looks like an annotated page; revealing the source animates a single highlight over real words rather than scattering decorative particles. Turbo visibly accelerates Layla and warms her wake, then settles. The trailer opens on demand and the flight pauses while the dialog is open. Reduced motion keeps all content and all walkthrough choices available without transitions.

The trailer is the 34-second in-house LearnLayla hackathon cut, not a Higgsfield render. It includes English captions in the picture and locally rendered Cori and LJ Speech voices; the two models' source recordings are listed as public domain. PDF content shown is from Schwaab et al. (2021), *The role of urban trees in reducing land surface temperatures in European cities*, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), with cropping and highlighting.
