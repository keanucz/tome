import type {
  Chapter,
  DeepPartial,
  Page,
  PartialStory,
  Scene,
  Story,
} from '@/lib/story/schema'

/**
 * Rich mock story (Seven Years' War) for dev/demo of the book renderer.
 * Exercises all five scene types. Image URLs are real Wikimedia Commons
 * files, verified to return HTTP 200 on 2026-07-18.
 */

const WIKI = 'https://en.wikipedia.org/wiki'

const IMG = {
  frederick:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Friedrich_Zweite_Alt.jpg/960px-Friedrich_Zweite_Alt.jpg',
  mariaTheresa:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Kaiserin_Maria_Theresia_%28HRR%29.jpg/960px-Kaiserin_Maria_Theresia_%28HRR%29.jpg',
  warMap:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/SevenYearsWar.png/1280px-SevenYearsWar.png',
  deathOfWolfe:
    'https://upload.wikimedia.org/wikipedia/commons/c/c6/Benjamin_West_-_The_Death_of_General_Wolfe_-_WGA25558.jpg',
} as const

export const mockStory: Story = {
  title: 'The Seven Years’ War',
  subtitle: 'How a Quarrel of Kings Set the World Ablaze',
  theme: {
    era: 'Enlightenment Europe, 1756–1763',
    fontPairing: 'enlightenment',
    palette: {
      paper: '#f3ead6',
      ink: '#2e2318',
      accent: '#8a3324',
      gold: '#b08a3e',
    },
    textureId: 'aged-paper',
    ambientPrompt:
      'An eighteenth-century oil painting of cannon smoke drifting over a European battlefield at dawn, muted umber and gold palette, in the manner of the age of Watteau',
  },
  chapters: [
    {
      title: 'The Gathering Storm',
      pages: [
        {
          scenes: [
            {
              type: 'chapter-header',
              title: 'The Gathering Storm',
              epigraph:
                '“Diplomacy without arms is like music without instruments.” — attributed to Frederick the Great',
              narration:
                'In the middle of the eighteenth century, Europe was a powder keg wearing a powdered wig. Prussia’s seizure of Silesia in 1740 had humiliated the Habsburg empress Maria Theresa, and she spent sixteen years preparing her revenge. Old alliances dissolved and old enemies embraced: Austria joined hands with France, its rival of two centuries, while Britain threw its purse behind Prussia. When Frederick marched into Saxony in August 1756, he lit a fuse that would burn across four continents.',
              citations: [
                {
                  articleTitle: "Seven Years' War",
                  url: `${WIKI}/Seven_Years%27_War`,
                  snippet:
                    'The Seven Years’ War (1756–1763) was a global conflict involving most of the European great powers.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'portrait',
              imageUrl: IMG.frederick,
              personName: 'Frederick the Great',
              caption: 'Portrait by Anton Graff, 1781',
              narration:
                'Frederick II of Prussia — history would call him the Great — was a soldier-king who wrote flute concertos between campaigns and corresponded with Voltaire while planning invasions. His army was the finest drilled in Europe, and he wielded it with a gambler’s nerve. Outnumbered on every frontier, he chose audacity: strike first, march faster, and trust the iron discipline of the Prussian line.',
              citations: [
                {
                  articleTitle: 'Frederick the Great',
                  url: `${WIKI}/Frederick_the_Great`,
                  snippet:
                    'Frederick II was King in Prussia from 1740 until 1786, the longest reign of any Hohenzollern king.',
                  sectionAnchor: 'Seven_Years%27_War',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'timeline',
              events: [
                {
                  year: '1740',
                  label: 'Frederick seizes the rich Habsburg province of Silesia',
                },
                {
                  year: '1748',
                  label:
                    'Peace of Aix-la-Chapelle pauses the struggle — but settles nothing',
                },
                {
                  year: '1754',
                  label:
                    'Shots in the Ohio Country: Washington ambushes a French patrol',
                },
                {
                  year: '1756',
                  label: 'The Diplomatic Revolution: Austria allies with France',
                },
                {
                  year: '1756',
                  label: 'Frederick invades Saxony; the world war begins',
                },
              ],
              narration:
                'The true first shots were fired not in Europe but in the American backwoods, where a young George Washington ambushed a French patrol in 1754. The skirmish rippled outward into the Diplomatic Revolution of 1756, the great reshuffling of alliances that left Prussia encircled — and convinced Frederick that his only chance was to strike first.',
              citations: [
                {
                  articleTitle: 'Diplomatic Revolution',
                  url: `${WIKI}/Diplomatic_Revolution`,
                  snippet:
                    'The Diplomatic Revolution of 1756 was the reversal of longstanding alliances in Europe between the War of the Austrian Succession and the Seven Years’ War.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'The World Ablaze',
      pages: [
        {
          scenes: [
            {
              type: 'chapter-header',
              title: 'The World Ablaze',
              epigraph:
                '“You know that these two nations are at war about a few acres of snow.” — Voltaire, Candide',
              narration:
                'What began on the Saxon border became the first truly global war. British and French fleets grappled from the Caribbean to the Bay of Bengal; in India the Company’s sepoys marched on Plassey; in North America whole forests swallowed armies. Churchill would later call it the first world war. And on the plains of Bohemia and Silesia, Frederick fought the combined weight of Austria, France, Russia, Saxony and Sweden — and at Rossbach and Leuthen shattered armies twice the size of his own.',
              citations: [
                {
                  articleTitle: "Seven Years' War",
                  url: `${WIKI}/Seven_Years%27_War`,
                  snippet:
                    'The war has been described as the first world war, spanning five continents and affecting Europe, the Americas, West Africa, India, and the Philippines.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'map-plate',
              imageUrl: IMG.warMap,
              caption:
                'The belligerents of the Seven Years’ War — a quarrel that spanned the globe',
              narration:
                'Trace the borders and you trace the ambitions of kings. Britain, Prussia and their allies stood against the vast coalition of France, Austria, Russia and, at the last, Spain. The war reached wherever their flags flew — from Quebec’s icy river to Manila’s harbor, from the sugar islands of the Caribbean to the coasts of Senegal.',
              citations: [
                {
                  articleTitle: "Seven Years' War",
                  url: `${WIKI}/Seven_Years%27_War`,
                  snippet:
                    'The Seven Years’ War involved all five European great powers of the time plus many of the middle powers and spanned five continents.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'portrait',
              imageUrl: IMG.mariaTheresa,
              personName: 'Maria Theresa',
              caption: 'Portrait by Martin van Meytens, c. 1759',
              narration:
                'Against Frederick stood Maria Theresa — Archduchess of Austria, Queen of Hungary and Bohemia, the only woman ever to rule the Habsburg lands in her own right. She had inherited a broken army and an empty treasury, and rebuilt both. Vienna’s alliance with Versailles was her masterstroke, and her generals handed Frederick the worst defeats of his life. She wanted Silesia back; she very nearly got it.',
              citations: [
                {
                  articleTitle: 'Maria Theresa',
                  url: `${WIKI}/Maria_Theresa`,
                  snippet:
                    'Maria Theresa was the ruler of the Habsburg dominions from 1740 until her death in 1780, and the only woman to hold the position in her own right.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'letter-quote',
              quoteText:
                'Against all the rules of the art of war, I am going to attack an enemy nearly twice as strong. I must take this step, or all is lost. We must beat the enemy, or let his batteries bury us all.',
              attribution: 'Frederick II, to his officers before Leuthen',
              date: '3 December 1757',
              narration:
                'On a frozen December morning near the village of Leuthen, Frederick gathered his officers and offered leave to any man who wished to depart. None did. What followed was his masterpiece: the Prussian army wheeled like a parade-ground drill onto the Austrian flank and rolled up a force of sixty-five thousand men. Napoleon later judged that Leuthen alone was enough to immortalize Frederick.',
              citations: [
                {
                  articleTitle: 'Battle of Leuthen',
                  url: `${WIKI}/Battle_of_Leuthen`,
                  snippet:
                    'Frederick the Great’s Prussian army used maneuver and terrain to decisively defeat a much larger Austrian force at Leuthen on 5 December 1757.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'The Exhausted Peace',
      pages: [
        {
          scenes: [
            {
              type: 'chapter-header',
              title: 'The Exhausted Peace',
              epigraph:
                '“I believe all is lost. I shall not survive the ruin of my fatherland.” — Frederick, after Kunersdorf, 1759',
              narration:
                'By 1759 the miracle-worker was losing. At Kunersdorf the Russians and Austrians annihilated half his army in a single afternoon, and Berlin itself would twice see enemy horsemen in its streets. That same year — Britain’s annus mirabilis — Quebec fell and the French fleets were broken at Lagos and Quiberon Bay. The war had become a contest of endurance, and every treasury in Europe was bleeding.',
              citations: [
                {
                  articleTitle: 'Battle of Kunersdorf',
                  url: `${WIKI}/Battle_of_Kunersdorf`,
                  snippet:
                    'The Battle of Kunersdorf on 12 August 1759 was Frederick the Great’s worst defeat, with roughly half of his army destroyed.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'map-plate',
              imageUrl: IMG.deathOfWolfe,
              caption: 'The Death of General Wolfe — Benjamin West, 1770',
              narration:
                'On the Plains of Abraham above Quebec, in a battle that lasted scarcely a quarter of an hour, both commanding generals fell. James Wolfe died at the moment of victory; the Marquis de Montcalm the next morning. Benjamin West painted the scene as a secular martyrdom and made it the most famous image the war ever produced. With Quebec fell French America.',
              citations: [
                {
                  articleTitle: 'Battle of the Plains of Abraham',
                  url: `${WIKI}/Battle_of_the_Plains_of_Abraham`,
                  snippet:
                    'The Battle of the Plains of Abraham, fought on 13 September 1759, was a pivotal victory that led to the fall of Quebec; both commanders, Wolfe and Montcalm, were mortally wounded.',
                },
              ],
            },
          ],
        },
        {
          scenes: [
            {
              type: 'timeline',
              events: [
                {
                  year: '1759',
                  label:
                    'Annus mirabilis: Quebec, Minden, Lagos and Quiberon Bay fall Britain’s way',
                },
                {
                  year: '1762',
                  label:
                    'The ‘miracle of Brandenburg’: the new tsar makes peace with Prussia',
                },
                {
                  year: '1763',
                  label:
                    'Treaty of Paris: France cedes Canada and the lands east of the Mississippi',
                },
                {
                  year: '1763',
                  label:
                    'Treaty of Hubertusburg: Frederick keeps Silesia, and the war ends',
                },
              ],
              narration:
                'Peace came not from victory but exhaustion. The Tsarina Elizabeth died and her successor, an ardent admirer of Frederick, handed Prussia back from the brink. At Paris, France signed away an empire; at Hubertusburg the map of Germany returned exactly to where it began — after seven years and perhaps a million dead. Britain emerged master of the seas, Prussia a great power, and France nursed the resentments that would carry her to the American cause, and on to revolution.',
              citations: [
                {
                  articleTitle: 'Treaty of Paris (1763)',
                  url: `${WIKI}/Treaty_of_Paris_(1763)`,
                  snippet:
                    'The Treaty of Paris was signed on 10 February 1763 and ended the Seven Years’ War between Great Britain and France, with France ceding New France to Britain.',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/* ── Streaming simulator ──────────────────────────────────────────────── */

type SimulateOptions = {
  /** ms between emitted snapshots (default 380). */
  interval?: number
}

/**
 * Replays `story` as a sequence of progressively deeper PartialStory
 * snapshots, imitating a `streamObject` arrival: title → theme → chapters →
 * pages → scenes (visual fields, half the narration, then the full scene).
 * Returns a cancel function.
 */
export function simulateStream(
  story: Story,
  onChunk: (partial: PartialStory) => void,
  { interval = 380 }: SimulateOptions = {},
): () => void {
  const snapshots = buildSnapshots(story)
  let i = 0
  const id = setInterval(() => {
    if (i >= snapshots.length) {
      clearInterval(id)
      return
    }
    onChunk(snapshots[i++])
  }, interval)
  return () => clearInterval(id)
}

function buildSnapshots(story: Story): PartialStory[] {
  const snaps: PartialStory[] = []
  // Working copy is mutated step by step; every emitted snapshot is a clone,
  // so consumers always receive fresh immutable objects.
  const work: PartialStory = {}
  const push = () => snaps.push(structuredClone(work))

  work.title = story.title
  push()
  work.subtitle = story.subtitle
  work.theme = structuredClone(story.theme)
  push()

  work.chapters = []
  for (const chapter of story.chapters) {
    const workChapter: DeepPartial<Chapter> = {
      title: chapter.title,
      pages: [],
    }
    work.chapters.push(workChapter)
    push()

    for (const page of chapter.pages) {
      const workPage: DeepPartial<Page> = { scenes: [] }
      workChapter.pages?.push(workPage)

      for (const scene of page.scenes) {
        const { narration, citations, ...visual } = scene
        const workScene = structuredClone(visual) as DeepPartial<Scene>
        workPage.scenes?.push(workScene)
        push()

        const words = narration.split(' ')
        workScene.narration = words
          .slice(0, Math.ceil(words.length / 2))
          .join(' ')
        push()

        workScene.narration = narration
        workScene.citations = structuredClone(citations)
        push()
      }
    }
  }

  return snaps
}
