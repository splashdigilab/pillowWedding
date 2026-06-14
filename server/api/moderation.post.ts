import { defineEventHandler, readBody, createError, getHeaders } from 'h3'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const text = body?.text || ''

    if (!text) {
        throw createError({ statusCode: 400, message: 'Missing text content for moderation' })
    }

    // Runtime context API Key (e.g configured via standard host env variable)
    const config = useRuntimeConfig()
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || ''

    // If no API key is set, we bypass the check gracefully to avoid breaking the user application
    if (!apiKey) {
        console.warn('[OpenAI Moderation] OPENAI_API_KEY is not set. Bypassing check.')
        return {
            flagged: false,
            bypassed: true
        }
    }

    // Basic retry logic implementation for OpenAI API 429 errors
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            // 1. Check with Moderation API first
            const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({ input: text })
            })

            if (!moderationResponse.ok) {
                const errorText = await moderationResponse.text().catch(() => '');
                console.error(`[OpenAI API Error] Status: ${moderationResponse.status}, Body: ${errorText}`);
                if (moderationResponse.status === 429) {
                    const isQuotaError = errorText.includes('insufficient_quota');
                    throw createError({
                        statusCode: 429,
                        message: isQuotaError ? 'Insufficient Quota' : 'Rate limit exceeded',
                        data: errorText
                    })
                }
                throw Error(`OpenAI Moderation API failed: ${moderationResponse.statusText}`)
            }

            const data = await moderationResponse.json()
            const result = data.results[0]

            // Check if Moderation API flags it
            if (result.flagged) {
                return {
                    flagged: true,
                    categories: result.categories,
                    bypassed: false
                }
            }

            // 2. Moderation API is notoriously weak on general profanity and slang.
            //    We use a fast, strict completion request to catch common dirty words/insults.
            const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content:
                                `你是一個專業的內容審核員，負責台灣「微樂客」韓流唱片行的留言過濾。
                                你的目標是：攔截惡意、色情與政治敏感內容，但「高度包容」粉絲的熱情表達。

                                【增加包容規則】
                                1. 興奮亂碼與符號：粉絲有時會因為太興奮而打出無意義的英數組合 (如：asdfghjk, A5a5a5) 或重複字元 (如：IIIIII, ！！！！！)，只要不包含髒話，請一律 PASS。
                                2. 品牌與可愛語：絕對准許「微樂客」、「WillMusic」、「喵喵」、「QQ」。
                                3. 灰色地帶從寬：台灣常用的「立馬、優化、質量」等詞彙請 PASS。

                                【嚴格攔截 (FLAG)】
                                1. 髒話與攻擊：中英韓文直接髒話、性暗示、針對藝人的辱罵 (如：XX狗、去死)。
                                2. 簡體中文：全文包含簡體字，直接 FLAG。
                                3. 強烈中國網路詞：僅攔截「yyds、絕絕子、栓Q、集美」等強烈對岸色彩詞彙。
                                4. 惡意廣告：博弈、情色網址、非法交易。

                                【判斷邏輯】
                                - 如果內容「看不懂但無害」（例如：A5a5a5oooo），請視為粉絲的興奮表達，回傳 PASS。
                                - 只有當內容「明確有害」時，才回傳 FLAG。

                                輸出格式：
                                - 僅回傳 "FLAG" 或 "PASS"。不要提供任何解釋。`
                        },
                        { role: 'user', content: text }
                    ],
                    temperature: 0,
                    max_completion_tokens: 5
                })
            })

            if (!chatResponse.ok) {
                const errorText = await chatResponse.text().catch(() => '');
                if (chatResponse.status === 429) {
                    throw createError({ statusCode: 429, message: 'Rate limit exceeded', data: errorText })
                }
                throw Error(`OpenAI Chat API failed: ${chatResponse.statusText}`)
            }

            const chatData = await chatResponse.json()
            const judgment = chatData.choices[0]?.message?.content?.trim().toUpperCase()

            if (judgment === 'FLAG') {
                return {
                    flagged: true,
                    categories: { profanity_strict: true },
                    bypassed: false
                }
            }

            return {
                flagged: false,
                bypassed: false
            }

        } catch (error: any) {
            if (error.statusCode === 429 && error.message !== 'Insufficient Quota' && retries < maxRetries - 1) {
                retries++;
                const delay = Math.pow(2, retries) * 500 + Math.random() * 500; // Exponential backoff with jitter
                console.warn(`[OpenAI Moderation Endpoint] Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${retries} of ${maxRetries - 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            console.error('[OpenAI Moderation Endpoint] final error:', error.message || error)
            // On unexpected errors (or max retries reached), we bypass the check so the client can still submit
            return {
                flagged: false,
                bypassed: true,
                error: error.message
            }
        }
    }
})
