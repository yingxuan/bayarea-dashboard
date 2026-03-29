export type JobMarketVerdict = "defensive" | "mixed" | "active";

export type JobMarketEvidenceTone = "negative" | "neutral" | "positive";

export interface JobMarketEvidence {
  id: "layoff_pressure" | "offer_flow" | "discussion_noise";
  label: string;
  valueText: string;
  note: string;
  tone: JobMarketEvidenceTone;
}

export interface JobMarketAction {
  id: string;
  title: string;
  reason: string;
  effort: "10min" | "30min" | "1hour";
  priority: 1 | 2 | 3;
}

export interface JobMarketPayload {
  asOf: string;
  verdict: JobMarketVerdict;
  headline: string;
  summary: string;
  evidence: JobMarketEvidence[];
  actions: JobMarketAction[];
  rationale: string[];
  dataQualityNote?: string;
}

export interface JobMarketInputs {
  layoffCount: number;
  offerCount: number;
  aiNewsCount: number;
  aiDiscussionCount: number;
}

export type SupportedLanguage = "zh" | "en";

const AI_KEYWORDS = [
  "ai",
  "gpt",
  "llm",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "agent",
  "agents",
  "agentic",
  "rag",
  "inference",
  "prompt",
  "model",
  "models",
  "machine learning",
  "deep learning",
  "人工智能",
  "大模型",
  "模型",
  "智能体",
];

type JobMarketActionTemplate = Omit<JobMarketAction, "priority">;

const zhActions: Record<JobMarketVerdict, JobMarketActionTemplate[]> = {
  defensive: [
    {
      id: "tighten_resume",
      title: "把简历收紧成 2 个最能证明 ownership 的项目",
      reason: "市场偏冷时，模糊经历会先被筛掉，先把可讲述性做扎实。",
      effort: "30min",
    },
    {
      id: "targeted_apply",
      title: "只投 3 个高度匹配岗位，不要继续泛投",
      reason: "岗位少时更需要提高命中率，而不是堆数量。",
      effort: "30min",
    },
    {
      id: "reality_check",
      title: "联系 1 个熟人确认团队真实 hiring bar",
      reason: "先拿到真实门槛，再决定是否补方向或调整预期。",
      effort: "10min",
    },
  ],
  mixed: [
    {
      id: "interview_story",
      title: "补一段能讲清问题、决策、结果的项目故事",
      reason: "有机会窗口时，面试叙事比继续刷帖子更值钱。",
      effort: "30min",
    },
    {
      id: "steady_pipeline",
      title: "维持今天的投递节奏，但只保留高相关岗位",
      reason: "市场不算热，但也没冷到需要完全停手。",
      effort: "30min",
    },
    {
      id: "skill_gap",
      title: "补一个最常被问到的能力缺口，不要同时补三项",
      reason: "现在更适合修短板，而不是重开职业路线。",
      effort: "1hour",
    },
  ],
  active: [
    {
      id: "increase_output",
      title: "今天增加一轮定向投递或约聊",
      reason: "机会在更新时，优先扩大有效输出。",
      effort: "30min",
    },
    {
      id: "prep_loop",
      title: "把最近一次项目经历整理成 3 分钟面试版本",
      reason: "市场活跃时，转化速度比信息焦虑更重要。",
      effort: "30min",
    },
    {
      id: "follow_up",
      title: "跟进最近沉默的 recruiter 或 referral",
      reason: "在岗位更新更频繁的时候，跟进更容易拿到反馈。",
      effort: "10min",
    },
  ],
};

const enActions: Record<JobMarketVerdict, JobMarketActionTemplate[]> = {
  defensive: [
    {
      id: "tighten_resume",
      title: "Tighten your resume around 2 ownership-heavy projects",
      reason: "When the market is cold, vague experience gets filtered first.",
      effort: "30min",
    },
    {
      id: "targeted_apply",
      title: "Apply to 3 highly matched roles instead of broad spraying",
      reason: "When openings are scarce, hit rate matters more than volume.",
      effort: "30min",
    },
    {
      id: "reality_check",
      title: "Ask 1 trusted contact what the real hiring bar is",
      reason: "Get first-hand signal before you reshape your whole plan.",
      effort: "10min",
    },
  ],
  mixed: [
    {
      id: "interview_story",
      title: "Sharpen one project story into problem, decision, result",
      reason: "When there is still flow, interview clarity beats doomscrolling.",
      effort: "30min",
    },
    {
      id: "steady_pipeline",
      title: "Keep applying today, but only to high-fit roles",
      reason: "The market is not hot, but it is not dead either.",
      effort: "30min",
    },
    {
      id: "skill_gap",
      title: "Close one likely skill gap instead of three at once",
      reason: "This is a moment to patch a weakness, not restart your career path.",
      effort: "1hour",
    },
  ],
  active: [
    {
      id: "increase_output",
      title: "Add one extra round of targeted applications or networking",
      reason: "When updates are flowing, effective output matters more than analysis.",
      effort: "30min",
    },
    {
      id: "prep_loop",
      title: "Turn one recent project into a 3-minute interview answer",
      reason: "In a more active market, conversion speed matters.",
      effort: "30min",
    },
    {
      id: "follow_up",
      title: "Follow up with recruiters or referrals that went quiet",
      reason: "More active markets make follow-ups more likely to convert.",
      effort: "10min",
    },
  ],
};

function getActions(lang: SupportedLanguage, verdict: JobMarketVerdict): JobMarketAction[] {
  const source = lang === "en" ? enActions : zhActions;
  return source[verdict].map((item, index) => ({
    ...item,
    priority: (index + 1) as 1 | 2 | 3,
  }));
}

function deriveVerdict(inputs: JobMarketInputs): JobMarketVerdict {
  const { layoffCount, offerCount, aiNewsCount, aiDiscussionCount } = inputs;
  const noiseLoad = aiNewsCount + aiDiscussionCount;

  if (offerCount === 0 && layoffCount >= 3) {
    return "defensive";
  }

  if (offerCount >= 6 && layoffCount <= 2) {
    return "active";
  }

  if (offerCount >= 4 && layoffCount <= 1 && noiseLoad <= 6) {
    return "active";
  }

  return "mixed";
}

export function countAIHits(titles: string[]): number {
  return titles.filter((title) => {
    const normalized = title.toLowerCase();
    return AI_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }).length;
}

export function buildJobMarketPayload(
  inputs: JobMarketInputs,
  lang: SupportedLanguage,
  asOf = new Date().toISOString(),
): JobMarketPayload {
  const verdict = deriveVerdict(inputs);
  const actions = getActions(lang, verdict);
  const aiHeat = inputs.aiNewsCount + inputs.aiDiscussionCount;

  const headlineByVerdict = {
    zh: {
      defensive: "市场偏冷，先守住命中率，不要被噪音带着跑。",
      mixed: "市场有噪音也有机会，继续推进，但动作要更收敛。",
      active: "机会还在更新，今天更适合提高输出和转化。",
    },
    en: {
      defensive: "The market looks cold. Protect hit rate instead of chasing noise.",
      mixed: "There is noise, but there is still flow. Keep moving, but stay selective.",
      active: "Opportunities are still updating. Today favors more output and conversion.",
    },
  } as const;

  const summaryByVerdict = {
    zh: {
      defensive: `社区里能看到裁员讨论，但 offer/面经更新偏少，先按偏防守方式推进。`,
      mixed: `社区里同时能看到裁员讨论和 offer/面经更新，这更像信号混杂，不是单边结论。`,
      active: `社区里持续有 offer/面经更新，说明至少还能看到明确的求职流动。`,
    },
    en: {
      defensive: "Layoff discussion is present while offer or interview updates are thin, so act more defensively.",
      mixed: "Both layoff discussion and offer or interview updates are showing up, which points to mixed signal rather than a one-way conclusion.",
      active: "Offer or interview updates are still showing up in the community, so there is still visible job-search flow.",
    },
  } as const;

  const discussionNote =
    lang === "en"
      ? aiHeat > 0
        ? `${aiHeat} AI-heavy headlines are adding noise, but they should not drive the verdict.`
        : "AI chatter is not the main driver today."
      : aiHeat > 0
        ? `${aiHeat} 条偏 AI 的讨论或新闻在放大噪音，但不应主导你的判断。`
        : "今天 AI 话题不是主要判断依据。";

  const evidence: JobMarketEvidence[] =
    lang === "en"
      ? [
          {
            id: "layoff_pressure",
            label: "Layoff Chatter",
            valueText: `${inputs.layoffCount} posts`,
            note:
              inputs.layoffCount > 0
                ? "This reflects what the community is talking about, not a direct measure of the whole market."
                : "There is little visible layoff discussion in the current feed.",
            tone: inputs.layoffCount > 0 ? "negative" : "neutral",
          },
          {
            id: "offer_flow",
            label: "Offer / Interview Flow",
            valueText: `${inputs.offerCount} items`,
            note:
              inputs.offerCount >= 4
                ? "There is still visible hiring flow in the feed, so you should keep executing."
                : "Flow is visible but still thin, so stay selective and disciplined.",
            tone: inputs.offerCount >= Math.max(3, inputs.layoffCount) ? "positive" : "neutral",
          },
          {
            id: "discussion_noise",
            label: "Discussion Noise",
            valueText: `${aiHeat} AI-heavy signals`,
            note: discussionNote,
            tone: aiHeat >= 6 ? "negative" : "neutral",
          },
        ]
      : [
          {
            id: "layoff_pressure",
            label: "裁员讨论",
            valueText: `${inputs.layoffCount} 条`,
            note:
              inputs.layoffCount > 0
                ? "这反映的是社区里出现了多少相关帖子，不是整个市场的直接刻度。"
                : "当前 feed 里几乎没有明显的裁员讨论。",
            tone: inputs.layoffCount > 0 ? "negative" : "neutral",
          },
          {
            id: "offer_flow",
            label: "Offer / 面经流动",
            valueText: `${inputs.offerCount} 条`,
            note:
              inputs.offerCount >= 4
                ? "仍然能看到明确的招聘流动，所以不该完全停手。"
                : "还有更新，但流动偏薄，执行上要更收敛。",
            tone: inputs.offerCount >= Math.max(3, inputs.layoffCount) ? "positive" : "neutral",
          },
          {
            id: "discussion_noise",
            label: "讨论噪音",
            valueText: `${aiHeat} 条`,
            note: discussionNote,
            tone: aiHeat >= 6 ? "negative" : "neutral",
          },
        ];

  const rationale =
    lang === "en"
      ? [
          "The verdict is driven primarily by layoff pressure versus offer or interview flow.",
          "Post counts are treated as community visibility signals, not literal market size.",
          "AI-heavy headlines are treated as noise amplification, not the main decision rule.",
          "The action list is tied to the verdict, so it behaves like a next-step plan rather than commentary.",
        ]
      : [
          "判断主要看裁员压力和 offer/面经流动的对比，不再靠情绪分数。",
          "帖子数量只代表社区可见度，不代表整个市场规模或真实强弱。",
          "AI 相关新闻只作为噪音放大器，不再主导结论。",
          "动作建议和判断结果绑定，目标是让你今天能直接执行，而不是继续解释情绪。",
        ];

  return {
    asOf,
    verdict,
    headline: headlineByVerdict[lang][verdict],
    summary: summaryByVerdict[lang][verdict],
    evidence,
    actions,
    rationale,
  };
}

export function getJobMarketFallbackPayload(lang: SupportedLanguage): JobMarketPayload {
  return {
    asOf: new Date().toISOString(),
    verdict: "mixed",
    headline:
      lang === "en"
        ? "Signal quality is limited right now, so default to one concrete career action."
        : "当前信号质量有限，但你仍然可以先推进一个具体动作。",
    summary:
      lang === "en"
        ? "The feed is incomplete, so do not over-read the market. Keep one high-confidence next step moving."
        : "当前数据不完整，不要过度解读市场，先推进一个高确定性的下一步。",
    evidence:
      lang === "en"
        ? [
            {
              id: "layoff_pressure",
              label: "Layoff Pressure",
              valueText: "Unavailable",
              note: "Live community feed is temporarily missing.",
              tone: "neutral",
            },
            {
              id: "offer_flow",
              label: "Offer / Interview Flow",
              valueText: "Unavailable",
              note: "Hiring-flow signal is temporarily missing.",
              tone: "neutral",
            },
            {
              id: "discussion_noise",
              label: "Discussion Noise",
              valueText: "Unknown",
              note: "Avoid turning incomplete data into a strong career conclusion.",
              tone: "neutral",
            },
          ]
        : [
            {
              id: "layoff_pressure",
              label: "裁员压力",
              valueText: "暂缺",
              note: "社区实时数据暂时不可用。",
              tone: "neutral",
            },
            {
              id: "offer_flow",
              label: "Offer / 面经流动",
              valueText: "暂缺",
              note: "招聘流动信号暂时不可用。",
              tone: "neutral",
            },
            {
              id: "discussion_noise",
              label: "讨论噪音",
              valueText: "未知",
              note: "不要拿不完整的数据推导过强的职业结论。",
              tone: "neutral",
            },
          ],
    actions: getActions(lang, "mixed"),
    rationale:
      lang === "en"
        ? [
            "Fallback mode avoids pretending confidence we do not have.",
            "Use it as a reminder to keep execution moving even when signal quality drops.",
          ]
        : [
            "保底模式不会假装自己有足够把握。",
            "数据不完整时，重点仍然是保持执行，而不是放大焦虑。",
          ],
    dataQualityNote:
      lang === "en"
        ? "Using fallback output because live feeds could not be loaded."
        : "当前使用保底结果，因为实时数据暂时没有成功加载。",
  };
}
