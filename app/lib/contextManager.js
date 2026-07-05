import logger from '@/lib/logger';
// Context size management system

// Maximum allowed user question length (default when no admin setting)
const DEFAULT_MAX_USER_QUESTION_LENGTH = 300000;

// Use a single context limit instead of model-specific limits
const DEFAULT_MAX_CONTEXT_TOKENS = 300000;

// Approximate token-to-character ratio (about 1 token ~= 4 chars in English)
const CHAR_TO_TOKEN_RATIO = 3;

export function estimateTokens(text) {
  return Math.ceil(text.length / CHAR_TO_TOKEN_RATIO);
}

export function canFitInContext(
  prompt,
  multiturnHistory,
  modelName,
  fileContent = ''
) {
  const maxTokens = DEFAULT_MAX_CONTEXT_TOKENS;

  const promptTokens = estimateTokens(prompt);
  const historyTokens = estimateTokens(multiturnHistory);
  const fileTokens = estimateTokens(fileContent);
  const responseBuffer = 500; // Reserved space for response

  const totalTokens =
    promptTokens + historyTokens + fileTokens + responseBuffer;

  return {
    canFit: totalTokens <= maxTokens,
    totalTokens,
    maxTokens,
    breakdown: {
      prompt: promptTokens,
      history: historyTokens,
      file: fileTokens,
      buffer: responseBuffer,
    },
  };
}

export function truncateToFit(content, maxTokens) {
  const maxChars = maxTokens * CHAR_TO_TOKEN_RATIO;
  if (content.length <= maxChars) return content;

  // Trim at word boundary
  const truncated = content.substring(0, maxChars);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  return lastSpaceIndex > maxChars * 0.8
    ? truncated.substring(0, lastSpaceIndex) + '...'
    : truncated + '...';
}

// Validate user question length
export function validateUserQuestion(
  userPrompt,
  maxLength = DEFAULT_MAX_USER_QUESTION_LENGTH
) {
  // Add null/undefined check
  if (!userPrompt || typeof userPrompt !== 'string') {
    return {
      valid: false,
      error: 'Please enter a question.',
    };
  }
  
  if (userPrompt.length > maxLength) {
    return {
      valid: false,
      error: `Question is too long. You can enter up to ${maxLength.toLocaleString()} characters. (Current: ${userPrompt.length.toLocaleString()} characters)`,
    };
  }
  return { valid: true };
}

// Filter system or status messages
function isSystemMessage(text) {
  const systemPatterns = [
    /^✅ Request successful/,
    /^❌ error Request failed/,
    /^🐣 Request guide/,
    /^⚡ Response stopped/,
    /^😊 Hope you are doing well/,
    /^🌟/,
    /success.*😊/,
    /failed.*error/,
  ];
  return systemPatterns.some((pattern) => pattern.test(text.trim()));
}

// Smart trimming for multi-turn history (filter system messages + remove longest messages first)
export function trimMultiturnHistory(messages, maxLength) {
  if (!messages || messages.length === 0) return '';

  // Filter system or status messages
  let workingMessages = messages.filter((msg) => !isSystemMessage(msg.text));

  let currentLength = workingMessages.reduce(
    (sum, msg) => sum + msg.text.length,
    0
  );

  while (currentLength > maxLength && workingMessages.length > 1) {
    // Find longest message
    let longestIndex = 0;
    let longestLength = 0;

    workingMessages.forEach((msg, index) => {
      if (msg.text.length > longestLength) {
        longestLength = msg.text.length;
        longestIndex = index;
      }
    });

    // Remove longest message
    const removedMsg = workingMessages.splice(longestIndex, 1)[0];
    currentLength -= removedMsg.text.length;
  }

  return workingMessages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');
}

export function smartContextManager(
  userPrompt,
  multiturnMessages,
  fileContent,
  modelName,
  systemPrompt = null,
  maxMultiturnCount = null
) {
  logger.info(
    '[smartContextManager] Received multiturnMessages:',
    multiturnMessages
  ); // Added log
  // Priority 1: validate user question length
  const userValidation = validateUserQuestion(userPrompt);
  if (!userValidation.valid) {
    return {
      error: true,
      message: userValidation.error,
    };
  }

  const maxTokens = DEFAULT_MAX_CONTEXT_TOKENS;
  const maxChars = maxTokens * CHAR_TO_TOKEN_RATIO;

  const userPromptLength = userPrompt.length;
  const fileContentLength = fileContent ? fileContent.length : 0;
  const systemPromptLength = systemPrompt ? systemPrompt.length : 0;
  const responseBuffer = 2000; // Reserved response space (character-based)

  // Guarantee user question + file content + system prompt + response buffer
  const guaranteedLength =
    userPromptLength + fileContentLength + systemPromptLength + responseBuffer;
  const remainingForHistory = maxChars - guaranteedLength;

  let multiturnHistory = '';
  let warning = null;

  if (multiturnMessages && multiturnMessages.length > 0) {
    if (remainingForHistory > 0) {
      // Fit multi-turn history into remaining space
      multiturnHistory = trimMultiturnHistory(
        multiturnMessages,
        remainingForHistory
      );

      // Check if it was truncated by comparing with original
      // Do not warn if maxMultiturnCount is set and max count has not been reached
      const originalLength = multiturnMessages.reduce(
        (sum, msg) => sum + msg.text.length,
        0
      );
      const trimmedLength = multiturnHistory.split('\n').filter(line => line.trim()).length;
      const originalMessageCount = multiturnMessages.length;
      
      // Check whether truncation happened due to context limit
      // Do not warn if maxMultiturnCount is set and max count has not been reached
      const isTruncated = multiturnHistory.length < originalLength;
      const isAtMaxCount = maxMultiturnCount !== null && originalMessageCount >= maxMultiturnCount;
      
      if (isTruncated && (maxMultiturnCount === null || isAtMaxCount)) {
        warning = `Some conversation history was excluded due to context limits. (Part of ${originalMessageCount} messages)`;
      }
    } else {
      // Proceed without history if there is not enough space
      warning = 'Previous conversation cannot be included due to context limits.';
    }
  }

  // Build final prompt
  let finalPrompt;
  const systemPart = systemPrompt ? `${systemPrompt}\n\n` : '';
  const historyPart = multiturnHistory ? `${multiturnHistory}\n` : '';

  // If file content exists, include both history and file content
  // fileContent itself already includes strong instructions
  const mainContent = fileContent
    ? `${historyPart}${fileContent}\n`
    : historyPart;

  finalPrompt = `${systemPart}${mainContent}User: ${userPrompt}\nAssistant:`;

  return {
    error: false,
    finalPrompt,
    warning,
    stats: {
      userPromptLength,
      fileContentLength,
      systemPromptLength,
      historyLength: multiturnHistory.length,
      totalLength: finalPrompt.length,
      maxAllowed: maxChars,
    },
  };
}
