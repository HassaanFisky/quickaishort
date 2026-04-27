/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (function() { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "(app-pages-browser)/./src/workers/analysis.worker.ts":
/*!****************************************!*\
  !*** ./src/workers/analysis.worker.ts ***!
  \****************************************/
/***/ (function(module, __unused_webpack_exports, __webpack_require__) {

eval(__webpack_require__.ts("function analyzeAudioPeaks(audioData, sampleRate) {\n    const windowSize = sampleRate * 2; // 2-second windows\n    const peaks = [];\n    for(let i = 0; i < audioData.length; i += windowSize){\n        const window = audioData.slice(i, i + windowSize);\n        const rms = Math.sqrt(window.reduce((sum, val)=>sum + val * val, 0) / window.length);\n        peaks.push(rms);\n    }\n    return peaks;\n}\nfunction analyzeSpeechDensity(transcript, duration) {\n    const windowSize = 2; // 2-second windows\n    const windows = Math.ceil(duration / windowSize);\n    const density = new Array(windows).fill(0);\n    for (const segment of transcript){\n        const startWindow = Math.floor(segment.start / windowSize);\n        const endWindow = Math.floor(segment.end / windowSize);\n        const wordCount = segment.text.split(/\\s+/).length;\n        const segmentDuration = Math.max(0.1, segment.end - segment.start);\n        const wordsPerSecond = wordCount / segmentDuration;\n        for(let w = startWindow; w <= endWindow && w < windows; w++){\n            density[w] = Math.max(density[w], wordsPerSecond);\n        }\n    }\n    return density;\n}\nfunction generateSuggestions(peaks, speechDensity, duration) {\n    const windowSize = 2;\n    const targetClipLength = 30; // 30 seconds\n    const suggestions = [];\n    // Normalize scores\n    const maxPeak = Math.max(...peaks, 0.0001);\n    const maxDensity = Math.max(...speechDensity, 0.0001);\n    const normalizedPeaks = peaks.map((p)=>p / maxPeak);\n    const normalizedDensity = speechDensity.map((d)=>d / maxDensity);\n    // Score each possible clip\n    const clipScores = [];\n    for(let start = 0; start < duration - targetClipLength; start += 5){\n        const startWindow = Math.floor(start / windowSize);\n        const endWindow = Math.floor((start + targetClipLength) / windowSize);\n        const windowPeaks = normalizedPeaks.slice(startWindow, endWindow);\n        const windowDensity = normalizedDensity.slice(startWindow, endWindow);\n        const avgPeak = windowPeaks.length ? windowPeaks.reduce((a, b)=>a + b, 0) / windowPeaks.length : 0;\n        const avgDensity = windowDensity.length ? windowDensity.reduce((a, b)=>a + b, 0) / windowDensity.length : 0;\n        const peakVariance = windowPeaks.length ? Math.max(...windowPeaks) - Math.min(...windowPeaks) : 0;\n        const compositeScore = avgPeak * 0.3 + avgDensity * 0.4 + peakVariance * 0.3;\n        clipScores.push({\n            start,\n            score: compositeScore,\n            scores: {\n                audioPeak: avgPeak,\n                motion: peakVariance,\n                speechDensity: avgDensity\n            }\n        });\n    }\n    // Sort and pick top 5 non-overlapping\n    clipScores.sort((a, b)=>b.score - a.score);\n    for (const clip of clipScores){\n        if (suggestions.length >= 5) break;\n        const overlaps = suggestions.some((s)=>Math.abs(s.start - clip.start) < targetClipLength);\n        if (!overlaps) {\n            const reasoning = generateViralReasoning(clip.scores);\n            suggestions.push({\n                id: \"clip-\".concat(suggestions.length + 1),\n                start: clip.start,\n                end: clip.start + targetClipLength,\n                confidence: Math.round(clip.score * 100),\n                scores: clip.scores,\n                reason: generateReason(clip.scores),\n                viralReasoning: reasoning.explanation,\n                suggestedCaptions: reasoning.captions,\n                automation_status: clip.score > 0.7 ? \"Ready\" : \"Pending\"\n            });\n        }\n    }\n    return suggestions.sort((a, b)=>a.start - b.start);\n}\nfunction generateReason(scores) {\n    const reasons = [];\n    if (scores.audioPeak > 0.7) reasons.push(\"high audio energy\");\n    if (scores.speechDensity > 0.7) reasons.push(\"dense speech\");\n    if (scores.motion > 0.5) reasons.push(\"dynamic moments\");\n    return reasons.length > 0 ? \"Contains \".concat(reasons.join(\", \")) : \"Balanced engagement\";\n}\nfunction generateViralReasoning(scores) {\n    const hooks = [\n        \"You won't believe what happens next!\",\n        \"The truth about this will shock you.\",\n        \"Why everyone is talking about this moment.\",\n        \"This is exactly why he's the best.\",\n        \"Wait for the ending, it's worth it.\"\n    ];\n    let explanation = \"This segment shows high retention potential due to \";\n    if (scores.audioPeak > 0.8) {\n        explanation += \"a significant emotional peak in the audio, signaling a viral 'hook'.\";\n    } else if (scores.speechDensity > 0.8) {\n        explanation += \"an information-dense delivery that is perfect for rapid-fire shorts.\";\n    } else if (scores.motion > 0.6) {\n        explanation += \"dynamic visual motion which captures viewer attention immediately.\";\n    } else {\n        explanation += \"a balanced mix of engagement factors optimized for the algorithm.\";\n    }\n    const selectedHooks = hooks.sort(()=>0.5 - Math.random()).slice(0, 2);\n    return {\n        explanation,\n        captions: selectedHooks\n    };\n}\nfunction detectSilence(audioData, sampleRate) {\n    let thresholdDb = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : -45, minSilenceDurationMs = arguments.length > 3 && arguments[3] !== void 0 ? arguments[3] : 500;\n    const threshold = Math.pow(10, thresholdDb / 20);\n    const minSilenceSamples = minSilenceDurationMs / 1000 * sampleRate;\n    const segments = [];\n    let isSilence = false;\n    let silenceStart = 0;\n    // Create windows for analysis (e.g., 100ms) to smooth out instant drops\n    const windowSize = Math.floor(sampleRate / 10);\n    const windows = Math.floor(audioData.length / windowSize);\n    let currentStart = 0;\n    // We will iterate sample by sample or window by window?\n    // Window by window is faster and sufficient for \"Jump Cut\".\n    // Let's use a smaller window like 10ms for precision (sampleRate / 100)\n    const preciseWindow = Math.floor(sampleRate / 100);\n    for(let i = 0; i < audioData.length; i += preciseWindow){\n        const end = Math.min(i + preciseWindow, audioData.length);\n        const chunk = audioData.slice(i, end);\n        // Calculate RMS of chunk\n        let sum = 0;\n        for(let j = 0; j < chunk.length; j++){\n            sum += chunk[j] * chunk[j];\n        }\n        const rms = Math.sqrt(sum / chunk.length);\n        const isBelowThreshold = rms < threshold;\n        // Simple state machine\n        if (isBelowThreshold && !isSilence) {\n            isSilence = true;\n            silenceStart = i;\n        } else if (!isBelowThreshold && isSilence) {\n            // End of silence\n            isSilence = false;\n            const durationSamples = i - silenceStart;\n            if (durationSamples >= minSilenceSamples) {\n                // It was a valid silence\n                // Push previous KEEP segment if exists\n                if (silenceStart > currentStart) {\n                    segments.push({\n                        start: currentStart / sampleRate,\n                        end: silenceStart / sampleRate,\n                        type: \"keep\"\n                    });\n                }\n                // Push SILENCE segment\n                segments.push({\n                    start: silenceStart / sampleRate,\n                    end: i / sampleRate,\n                    type: \"silence\"\n                });\n                currentStart = i;\n            } else {\n            // Ignored silence (too short), treated as keep\n            }\n        }\n    }\n    // Final segment\n    if (currentStart < audioData.length) {\n        segments.push({\n            start: currentStart / sampleRate,\n            end: audioData.length / sampleRate,\n            type: \"keep\"\n        });\n    }\n    return segments;\n}\nself.onmessage = async (e)=>{\n    try {\n        const { type, payload } = e.data;\n        if (type === \"analyze\") {\n            const { audioData, transcript, duration, sampleRate } = payload;\n            self.postMessage({\n                type: \"status\",\n                stage: \"process\",\n                payload: {\n                    message: \"Analyzing audio peaks...\"\n                }\n            });\n            const peaks = analyzeAudioPeaks(audioData, sampleRate);\n            self.postMessage({\n                type: \"progress\",\n                stage: \"process\",\n                payload: {\n                    progress: 50,\n                    message: \"Analyzing speech density...\"\n                }\n            });\n            const speechDensity = analyzeSpeechDensity(transcript, duration);\n            self.postMessage({\n                type: \"progress\",\n                stage: \"process\",\n                payload: {\n                    progress: 80,\n                    message: \"Generating suggestions...\"\n                }\n            });\n            const suggestions = generateSuggestions(peaks, speechDensity, duration);\n            self.postMessage({\n                type: \"complete\",\n                stage: \"process\",\n                payload: {\n                    suggestions\n                }\n            });\n        }\n        if (type === \"detect_silence\") {\n            const { audioData, sampleRate, thresholdDb, minSilenceDurationMs } = payload;\n            self.postMessage({\n                type: \"status\",\n                stage: \"process\",\n                payload: {\n                    message: \"Detecting silence...\"\n                }\n            });\n            const segments = detectSilence(audioData, sampleRate, thresholdDb, minSilenceDurationMs);\n            self.postMessage({\n                type: \"silence_detected\",\n                stage: \"complete\",\n                payload: {\n                    segments\n                }\n            });\n        }\n    } catch (error) {\n        self.postMessage({\n            type: \"error\",\n            stage: \"process\",\n            payload: {\n                message: error instanceof Error ? error.message : \"Unknown error\"\n            }\n        });\n    }\n};\n\n\n;\n    // Wrapped in an IIFE to avoid polluting the global scope\n    ;\n    (function () {\n        var _a, _b;\n        // Legacy CSS implementations will `eval` browser code in a Node.js context\n        // to extract CSS. For backwards compatibility, we need to check we're in a\n        // browser context before continuing.\n        if (typeof self !== 'undefined' &&\n            // AMP / No-JS mode does not inject these helpers:\n            '$RefreshHelpers$' in self) {\n            // @ts-ignore __webpack_module__ is global\n            var currentExports = module.exports;\n            // @ts-ignore __webpack_module__ is global\n            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;\n            // This cannot happen in MainTemplate because the exports mismatch between\n            // templating and execution.\n            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);\n            // A module can be accepted automatically based on its exports, e.g. when\n            // it is a Refresh Boundary.\n            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {\n                // Save the previous exports signature on update so we can compare the boundary\n                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)\n                module.hot.dispose(function (data) {\n                    data.prevSignature =\n                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);\n                });\n                // Unconditionally accept an update to this module, we'll check if it's\n                // still a Refresh Boundary later.\n                // @ts-ignore importMeta is replaced in the loader\n                module.hot.accept();\n                // This field is set when the previous version of this module was a\n                // Refresh Boundary, letting us know we need to check for invalidation or\n                // enqueue an update.\n                if (prevSignature !== null) {\n                    // A boundary can become ineligible if its exports are incompatible\n                    // with the previous exports.\n                    //\n                    // For example, if you add/remove/change exports, we'll want to\n                    // re-execute the importing modules, and force those components to\n                    // re-render. Similarly, if you convert a class component to a\n                    // function, we want to invalidate the boundary.\n                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {\n                        module.hot.invalidate();\n                    }\n                    else {\n                        self.$RefreshHelpers$.scheduleUpdate();\n                    }\n                }\n            }\n            else {\n                // Since we just executed the code for the module, it's possible that the\n                // new exports made it ineligible for being a boundary.\n                // We only care about the case when we were _previously_ a boundary,\n                // because we already accepted this update (accidental side effect).\n                var isNoLongerABoundary = prevSignature !== null;\n                if (isNoLongerABoundary) {\n                    module.hot.invalidate();\n                }\n            }\n        }\n    })();\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKGFwcC1wYWdlcy1icm93c2VyKS8uL3NyYy93b3JrZXJzL2FuYWx5c2lzLndvcmtlci50cyIsIm1hcHBpbmdzIjoiQUFzQkEsU0FBU0Esa0JBQ1BDLFNBQXVCLEVBQ3ZCQyxVQUFrQjtJQUVsQixNQUFNQyxhQUFhRCxhQUFhLEdBQUcsbUJBQW1CO0lBQ3RELE1BQU1FLFFBQWtCLEVBQUU7SUFFMUIsSUFBSyxJQUFJQyxJQUFJLEdBQUdBLElBQUlKLFVBQVVLLE1BQU0sRUFBRUQsS0FBS0YsV0FBWTtRQUNyRCxNQUFNSSxTQUFTTixVQUFVTyxLQUFLLENBQUNILEdBQUdBLElBQUlGO1FBQ3RDLE1BQU1NLE1BQU1DLEtBQUtDLElBQUksQ0FDbkJKLE9BQU9LLE1BQU0sQ0FBQyxDQUFDQyxLQUFLQyxNQUFRRCxNQUFNQyxNQUFNQSxLQUFLLEtBQUtQLE9BQU9ELE1BQU07UUFFakVGLE1BQU1XLElBQUksQ0FBQ047SUFDYjtJQUVBLE9BQU9MO0FBQ1Q7QUFFQSxTQUFTWSxxQkFDUEMsVUFBK0IsRUFDL0JDLFFBQWdCO0lBRWhCLE1BQU1mLGFBQWEsR0FBRyxtQkFBbUI7SUFDekMsTUFBTWdCLFVBQVVULEtBQUtVLElBQUksQ0FBQ0YsV0FBV2Y7SUFDckMsTUFBTWtCLFVBQW9CLElBQUlDLE1BQU1ILFNBQVNJLElBQUksQ0FBQztJQUVsRCxLQUFLLE1BQU1DLFdBQVdQLFdBQVk7UUFDaEMsTUFBTVEsY0FBY2YsS0FBS2dCLEtBQUssQ0FBQ0YsUUFBUUcsS0FBSyxHQUFHeEI7UUFDL0MsTUFBTXlCLFlBQVlsQixLQUFLZ0IsS0FBSyxDQUFDRixRQUFRSyxHQUFHLEdBQUcxQjtRQUMzQyxNQUFNMkIsWUFBWU4sUUFBUU8sSUFBSSxDQUFDQyxLQUFLLENBQUMsT0FBTzFCLE1BQU07UUFDbEQsTUFBTTJCLGtCQUFrQnZCLEtBQUt3QixHQUFHLENBQUMsS0FBS1YsUUFBUUssR0FBRyxHQUFHTCxRQUFRRyxLQUFLO1FBQ2pFLE1BQU1RLGlCQUFpQkwsWUFBWUc7UUFFbkMsSUFB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LFVBQVU7b0JBQUlELFNBQVM7Z0JBQThCO1lBQ2xFO1lBRUEsTUFBTXRFLGdCQUFnQnRCLHFCQUFxQkMsWUFBWUM7WUFFdkRtRixLQUFLSyxXQUFXLENBQUM7Z0JBQ2ZOLE1BQU07Z0JBQ05PLE9BQU87Z0JBQ1BILFNBQVM7b0JBQUVLLFVBQVU7b0JBQUlELFNBQVM7Z0JBQTRCO1lBQ2hFO1lBRUEsTUFBTXBFLGNBQWNILG9CQUFvQmpDLE9BQU9rQyxlQUFlcEI7WUFFOURtRixLQUFLSyxXQUFXLENBQUM7Z0JBQ2ZOLE1BQU07Z0JBQ05PLE9BQU87Z0JBQ1BILFNBQVM7b0JBQUVoRTtnQkFBWTtZQUN6QjtRQUNGO1FBRUEsSUFBSTRELFNBQVMsa0JBQWtCO1lBQzdCLE1BQU0sRUFBRW5HLFNBQVMsRUFBRUMsVUFBVSxFQUFFb0YsV0FBVyxFQUFFQyxvQkFBb0IsRUFBRSxHQUNoRWlCO1lBRUZILEtBQUtLLFdBQVcsQ0FBQztnQkFDZk4sTUFBTTtnQkFDTk8sT0FBTztnQkFDUEgsU0FBUztvQkFBRUksU0FBUztnQkFBdUI7WUFDN0M7WUFFQSxNQUFNakIsV0FBV04sY0FDZnBGLFdBQ0FDLFlBQ0FvRixhQUNBQztZQUdGYyxLQUFLSyxXQUFXLENBQUM7Z0JBQ2ZOLE1BQU07Z0JBQ05PLE9BQU87Z0JBQ1BILFNBQVM7b0JBQUViO2dCQUFTO1lBQ3RCO1FBQ0Y7SUFDRixFQUFFLE9BQU9tQixPQUFPO1FBQ2RULEtBQUtLLFdBQVcsQ0FBQztZQUNmTixNQUFNO1lBQ05PLE9BQU87WUFDUEgsU0FBUztnQkFDUEksU0FBU0UsaUJBQWlCQyxRQUFRRCxNQUFNRixPQUFPLEdBQUc7WUFDcEQ7UUFDRjtJQUNGO0FBQ0YiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9fTl9FLy4vc3JjL3dvcmtlcnMvYW5hbHlzaXMud29ya2VyLnRzPzExNjYiXSwic291cmNlc0NvbnRlbnQiOlsiaW50ZXJmYWNlIFRyYW5zY3JpcHRTZWdtZW50IHtcclxuICBzdGFydDogbnVtYmVyO1xyXG4gIGVuZDogbnVtYmVyO1xyXG4gIHRleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIENsaXBTdWdnZXN0aW9uIHtcclxuICBpZDogc3RyaW5nO1xyXG4gIHN0YXJ0OiBudW1iZXI7XHJcbiAgZW5kOiBudW1iZXI7XHJcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xyXG4gIHNjb3Jlczoge1xyXG4gICAgYXVkaW9QZWFrOiBudW1iZXI7XHJcbiAgICBtb3Rpb246IG51bWJlcjtcclxuICAgIHNwZWVjaERlbnNpdHk6IG51bWJlcjtcclxuICB9O1xyXG4gIHJlYXNvbjogc3RyaW5nO1xyXG4gIHZpcmFsUmVhc29uaW5nPzogc3RyaW5nO1xyXG4gIHN1Z2dlc3RlZENhcHRpb25zPzogc3RyaW5nW107XHJcbiAgYXV0b21hdGlvbl9zdGF0dXM/OiBcIlJlYWR5XCIgfCBcIlBlbmRpbmdcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gYW5hbHl6ZUF1ZGlvUGVha3MoXHJcbiAgYXVkaW9EYXRhOiBGbG9hdDMyQXJyYXksXHJcbiAgc2FtcGxlUmF0ZTogbnVtYmVyLFxyXG4pOiBudW1iZXJbXSB7XHJcbiAgY29uc3Qgd2luZG93U2l6ZSA9IHNhbXBsZVJhdGUgKiAyOyAvLyAyLXNlY29uZCB3aW5kb3dzXHJcbiAgY29uc3QgcGVha3M6IG51bWJlcltdID0gW107XHJcblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYXVkaW9EYXRhLmxlbmd0aDsgaSArPSB3aW5kb3dTaXplKSB7XHJcbiAgICBjb25zdCB3aW5kb3cgPSBhdWRpb0RhdGEuc2xpY2UoaSwgaSArIHdpbmRvd1NpemUpO1xyXG4gICAgY29uc3Qgcm1zID0gTWF0aC5zcXJ0KFxyXG4gICAgICB3aW5kb3cucmVkdWNlKChzdW0sIHZhbCkgPT4gc3VtICsgdmFsICogdmFsLCAwKSAvIHdpbmRvdy5sZW5ndGgsXHJcbiAgICApO1xyXG4gICAgcGVha3MucHVzaChybXMpO1xyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHBlYWtzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhbmFseXplU3BlZWNoRGVuc2l0eShcclxuICB0cmFuc2NyaXB0OiBUcmFuc2NyaXB0U2VnbWVudFtdLFxyXG4gIGR1cmF0aW9uOiBudW1iZXIsXHJcbik6IG51bWJlcltdIHtcclxuICBjb25zdCB3aW5kb3dTaXplID0gMjsgLy8gMi1zZWNvbmQgd2luZG93c1xyXG4gIGNvbnN0IHdpbmRvd3MgPSBNYXRoLmNlaWwoZHVyYXRpb24gLyB3aW5kb3dTaXplKTtcclxuICBjb25zdCBkZW5zaXR5OiBudW1iZXJbXSA9IG5ldyBBcnJheSh3aW5kb3dzKS5maWxsKDApO1xyXG5cclxuICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgdHJhbnNjcmlwdCkge1xyXG4gICAgY29uc3Qgc3RhcnRXaW5kb3cgPSBNYXRoLmZsb29yKHNlZ21lbnQuc3RhcnQgLyB3aW5kb3dTaXplKTtcclxuICAgIGNvbnN0IGVuZFdpbmRvdyA9IE1hdGguZmxvb3Ioc2VnbWVudC5lbmQgLyB3aW5kb3dTaXplKTtcclxuICAgIGNvbnN0IHdvcmRDb3VudCA9IHNlZ21lbnQudGV4dC5zcGxpdCgvXFxzKy8pLmxlbmd0aDtcclxuICAgIGNvbnN0IHNlZ21lbnREdXJhdGlvbiA9IE1hdGgubWF4KDAuMSwgc2VnbWVudC5lbmQgLSBzZWdtZW50LnN0YXJ0KTtcclxuICAgIGNvbnN0IHdvcmRzUGVyU2Vjb25kID0gd29yZENvdW50IC8gc2VnbWVudER1cmF0aW9uO1xyXG5cclxuICAgIGZvciAobGV0IHcgPSBzdGFydFdpbmRvdzsgdyA8PSBlbmRXaW5kb3cgJiYgdyA8IHdpbmRvd3M7IHcrKykge1xyXG4gICAgICBkZW5zaXR5W3ddID0gTWF0aC5tYXgoZGVuc2l0eVt3XSwgd29yZHNQZXJTZWNvbmQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIGRlbnNpdHk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbmVyYXRlU3VnZ2VzdGlvbnMoXHJcbiAgcGVha3M6IG51bWJlcltdLFxyXG4gIHNwZWVjaERlbnNpdHk6IG51bWJlcltdLFxyXG4gIGR1cmF0aW9uOiBudW1iZXIsXHJcbik6IENsaXBTdWdnZXN0aW9uW10ge1xyXG4gIGNvbnN0IHdpbmRvd1NpemUgPSAyO1xyXG4gIGNvbnN0IHRhcmdldENsaXBMZW5ndGggPSAzMDsgLy8gMzAgc2Vjb25kc1xyXG4gIGNvbnN0IHN1Z2dlc3Rpb25zOiBDbGlwU3VnZ2VzdGlvbltdID0gW107XHJcblxyXG4gIC8vIE5vcm1hbGl6ZSBzY29yZXNcclxuICBjb25zdCBtYXhQZWFrID0gTWF0aC5tYXgoLi4ucGVha3MsIDAuMDAwMSk7XHJcbiAgY29uc3QgbWF4RGVuc2l0eSA9IE1hdGgubWF4KC4uLnNwZWVjaERlbnNpdHksIDAuMDAwMSk7XHJcblxyXG4gIGNvbnN0IG5vcm1hbGl6ZWRQZWFrcyA9IHBlYWtzLm1hcCgocCkgPT4gcCAvIG1heFBlYWspO1xyXG4gIGNvbnN0IG5vcm1hbGl6ZWREZW5zaXR5ID0gc3BlZWNoRGVuc2l0eS5tYXAoKGQpID0+IGQgLyBtYXhEZW5zaXR5KTtcclxuXHJcbiAgLy8gU2NvcmUgZWFjaCBwb3NzaWJsZSBjbGlwXHJcbiAgY29uc3QgY2xpcFNjb3JlczogQXJyYXk8e1xyXG4gICAgc3RhcnQ6IG51bWJlcjtcclxuICAgIHNjb3JlOiBudW1iZXI7XHJcbiAgICBzY29yZXM6IHtcclxuICAgICAgYXVkaW9QZWFrOiBudW1iZXI7XHJcbiAgICAgIG1vdGlvbjogbnVtYmVyO1xyXG4gICAgICBzcGVlY2hEZW5zaXR5OiBudW1iZXI7XHJcbiAgICB9O1xyXG4gIH0+ID0gW107XHJcblxyXG4gIGZvciAobGV0IHN0YXJ0ID0gMDsgc3RhcnQgPCBkdXJhdGlvbiAtIHRhcmdldENsaXBMZW5ndGg7IHN0YXJ0ICs9IDUpIHtcclxuICAgIGNvbnN0IHN0YXJ0V2luZG93ID0gTWF0aC5mbG9vcihzdGFydCAvIHdpbmRvd1NpemUpO1xyXG4gICAgY29uc3QgZW5kV2luZG93ID0gTWF0aC5mbG9vcigoc3RhcnQgKyB0YXJnZXRDbGlwTGVuZ3RoKSAvIHdpbmRvd1NpemUpO1xyXG5cclxuICAgIGNvbnN0IHdpbmRvd1BlYWtzID0gbm9ybWFsaXplZFBlYWtzLnNsaWNlKHN0YXJ0V2luZG93LCBlbmRXaW5kb3cpO1xyXG4gICAgY29uc3Qgd2luZG93RGVuc2l0eSA9IG5vcm1hbGl6ZWREZW5zaXR5LnNsaWNlKHN0YXJ0V2luZG93LCBlbmRXaW5kb3cpO1xyXG5cclxuICAgIGNvbnN0IGF2Z1BlYWsgPSB3aW5kb3dQZWFrcy5sZW5ndGhcclxuICAgICAgPyB3aW5kb3dQZWFrcy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIHdpbmRvd1BlYWtzLmxlbmd0aFxyXG4gICAgICA6IDA7XHJcbiAgICBjb25zdCBhdmdEZW5zaXR5ID0gd2luZG93RGVuc2l0eS5sZW5ndGhcclxuICAgICAgPyB3aW5kb3dEZW5zaXR5LnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIC8gd2luZG93RGVuc2l0eS5sZW5ndGhcclxuICAgICAgOiAwO1xyXG4gICAgY29uc3QgcGVha1ZhcmlhbmNlID0gd2luZG93UGVha3MubGVuZ3RoXHJcbiAgICAgID8gTWF0aC5tYXgoLi4ud2luZG93UGVha3MpIC0gTWF0aC5taW4oLi4ud2luZG93UGVha3MpXHJcbiAgICAgIDogMDtcclxuXHJcbiAgICBjb25zdCBjb21wb3NpdGVTY29yZSA9XHJcbiAgICAgIGF2Z1BlYWsgKiAwLjMgKyBhdmdEZW5zaXR5ICogMC40ICsgcGVha1ZhcmlhbmNlICogMC4zO1xyXG5cclxuICAgIGNsaXBTY29yZXMucHVzaCh7XHJcbiAgICAgIHN0YXJ0LFxyXG4gICAgICBzY29yZTogY29tcG9zaXRlU2NvcmUsXHJcbiAgICAgIHNjb3Jlczoge1xyXG4gICAgICAgIGF1ZGlvUGVhazogYXZnUGVhayxcclxuICAgICAgICBtb3Rpb246IHBlYWtWYXJpYW5jZSxcclxuICAgICAgICBzcGVlY2hEZW5zaXR5OiBhdmdEZW5zaXR5LFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBTb3J0IGFuZCBwaWNrIHRvcCA1IG5vbi1vdmVybGFwcGluZ1xyXG4gIGNsaXBTY29yZXMuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xyXG5cclxuICBmb3IgKGNvbnN0IGNsaXAgb2YgY2xpcFNjb3Jlcykge1xyXG4gICAgaWYgKHN1Z2dlc3Rpb25zLmxlbmd0aCA+PSA1KSBicmVhaztcclxuXHJcbiAgICBjb25zdCBvdmVybGFwcyA9IHN1Z2dlc3Rpb25zLnNvbWUoXHJcbiAgICAgIChzKSA9PiBNYXRoLmFicyhzLnN0YXJ0IC0gY2xpcC5zdGFydCkgPCB0YXJnZXRDbGlwTGVuZ3RoLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIW92ZXJsYXBzKSB7XHJcbiAgICAgIGNvbnN0IHJlYXNvbmluZyA9IGdlbmVyYXRlVmlyYWxSZWFzb25pbmcoY2xpcC5zY29yZXMpO1xyXG4gICAgICBzdWdnZXN0aW9ucy5wdXNoKHtcclxuICAgICAgICBpZDogYGNsaXAtJHtzdWdnZXN0aW9ucy5sZW5ndGggKyAxfWAsXHJcbiAgICAgICAgc3RhcnQ6IGNsaXAuc3RhcnQsXHJcbiAgICAgICAgZW5kOiBjbGlwLnN0YXJ0ICsgdGFyZ2V0Q2xpcExlbmd0aCxcclxuICAgICAgICBjb25maWRlbmNlOiBNYXRoLnJvdW5kKGNsaXAuc2NvcmUgKiAxMDApLFxyXG4gICAgICAgIHNjb3JlczogY2xpcC5zY29yZXMsXHJcbiAgICAgICAgcmVhc29uOiBnZW5lcmF0ZVJlYXNvbihjbGlwLnNjb3JlcyksXHJcbiAgICAgICAgdmlyYWxSZWFzb25pbmc6IHJlYXNvbmluZy5leHBsYW5hdGlvbixcclxuICAgICAgICBzdWdnZXN0ZWRDYXB0aW9uczogcmVhc29uaW5nLmNhcHRpb25zLFxyXG4gICAgICAgIGF1dG9tYXRpb25fc3RhdHVzOiBjbGlwLnNjb3JlID4gMC43ID8gXCJSZWFkeVwiIDogXCJQZW5kaW5nXCIsXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcmV0dXJuIHN1Z2dlc3Rpb25zLnNvcnQoKGEsIGIpID0+IGEuc3RhcnQgLSBiLnN0YXJ0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVSZWFzb24oc2NvcmVzOiB7XHJcbiAgYXVkaW9QZWFrOiBudW1iZXI7XHJcbiAgbW90aW9uOiBudW1iZXI7XHJcbiAgc3BlZWNoRGVuc2l0eTogbnVtYmVyO1xyXG59KTogc3RyaW5nIHtcclxuICBjb25zdCByZWFzb25zOiBzdHJpbmdbXSA9IFtdO1xyXG4gIGlmIChzY29yZXMuYXVkaW9QZWFrID4gMC43KSByZWFzb25zLnB1c2goXCJoaWdoIGF1ZGlvIGVuZXJneVwiKTtcclxuICBpZiAoc2NvcmVzLnNwZWVjaERlbnNpdHkgPiAwLjcpIHJlYXNvbnMucHVzaChcImRlbnNlIHNwZWVjaFwiKTtcclxuICBpZiAoc2NvcmVzLm1vdGlvbiA+IDAuNSkgcmVhc29ucy5wdXNoKFwiZHluYW1pYyBtb21lbnRzXCIpO1xyXG4gIHJldHVybiByZWFzb25zLmxlbmd0aCA+IDBcclxuICAgID8gYENvbnRhaW5zICR7cmVhc29ucy5qb2luKFwiLCBcIil9YFxyXG4gICAgOiBcIkJhbGFuY2VkIGVuZ2FnZW1lbnRcIjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVWaXJhbFJlYXNvbmluZyhzY29yZXM6IHtcclxuICBhdWRpb1BlYWs6IG51bWJlcjtcclxuICBtb3Rpb246IG51bWJlcjtcclxuICBzcGVlY2hEZW5zaXR5OiBudW1iZXI7XHJcbn0pOiB7IGV4cGxhbmF0aW9uOiBzdHJpbmc7IGNhcHRpb25zOiBzdHJpbmdbXSB9IHtcclxuICBjb25zdCBob29rcyA9IFtcclxuICAgIFwiWW91IHdvbid0IGJlbGlldmUgd2hhdCBoYXBwZW5zIG5leHQhXCIsXHJcbiAgICBcIlRoZSB0cnV0aCBhYm91dCB0aGlzIHdpbGwgc2hvY2sgeW91LlwiLFxyXG4gICAgXCJXaHkgZXZlcnlvbmUgaXMgdGFsa2luZyBhYm91dCB0aGlzIG1vbWVudC5cIixcclxuICAgIFwiVGhpcyBpcyBleGFjdGx5IHdoeSBoZSdzIHRoZSBiZXN0LlwiLFxyXG4gICAgXCJXYWl0IGZvciB0aGUgZW5kaW5nLCBpdCdzIHdvcnRoIGl0LlwiXHJcbiAgXTtcclxuXHJcbiAgbGV0IGV4cGxhbmF0aW9uID0gXCJUaGlzIHNlZ21lbnQgc2hvd3MgaGlnaCByZXRlbnRpb24gcG90ZW50aWFsIGR1ZSB0byBcIjtcclxuICBpZiAoc2NvcmVzLmF1ZGlvUGVhayA+IDAuOCkge1xyXG4gICAgZXhwbGFuYXRpb24gKz0gXCJhIHNpZ25pZmljYW50IGVtb3Rpb25hbCBwZWFrIGluIHRoZSBhdWRpbywgc2lnbmFsaW5nIGEgdmlyYWwgJ2hvb2snLlwiO1xyXG4gIH0gZWxzZSBpZiAoc2NvcmVzLnNwZWVjaERlbnNpdHkgPiAwLjgpIHtcclxuICAgIGV4cGxhbmF0aW9uICs9IFwiYW4gaW5mb3JtYXRpb24tZGVuc2UgZGVsaXZlcnkgdGhhdCBpcyBwZXJmZWN0IGZvciByYXBpZC1maXJlIHNob3J0cy5cIjtcclxuICB9IGVsc2UgaWYgKHNjb3Jlcy5tb3Rpb24gPiAwLjYpIHtcclxuICAgIGV4cGxhbmF0aW9uICs9IFwiZHluYW1pYyB2aXN1YWwgbW90aW9uIHdoaWNoIGNhcHR1cmVzIHZpZXdlciBhdHRlbnRpb24gaW1tZWRpYXRlbHkuXCI7XHJcbiAgfSBlbHNlIHtcclxuICAgIGV4cGxhbmF0aW9uICs9IFwiYSBiYWxhbmNlZCBtaXggb2YgZW5nYWdlbWVudCBmYWN0b3JzIG9wdGltaXplZCBmb3IgdGhlIGFsZ29yaXRobS5cIjtcclxuICB9XHJcblxyXG4gIGNvbnN0IHNlbGVjdGVkSG9va3MgPSBob29rc1xyXG4gICAgLnNvcnQoKCkgPT4gMC41IC0gTWF0aC5yYW5kb20oKSlcclxuICAgIC5zbGljZSgwLCAyKTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIGV4cGxhbmF0aW9uLFxyXG4gICAgY2FwdGlvbnM6IHNlbGVjdGVkSG9va3NcclxuICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ3V0U2VnbWVudCB7XHJcbiAgc3RhcnQ6IG51bWJlcjtcclxuICBlbmQ6IG51bWJlcjtcclxuICB0eXBlOiBcImtlZXBcIiB8IFwic2lsZW5jZVwiO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZXRlY3RTaWxlbmNlKFxyXG4gIGF1ZGlvRGF0YTogRmxvYXQzMkFycmF5LFxyXG4gIHNhbXBsZVJhdGU6IG51bWJlcixcclxuICB0aHJlc2hvbGREYjogbnVtYmVyID0gLTQ1LFxyXG4gIG1pblNpbGVuY2VEdXJhdGlvbk1zOiBudW1iZXIgPSA1MDAsXHJcbik6IEN1dFNlZ21lbnRbXSB7XHJcbiAgY29uc3QgdGhyZXNob2xkID0gTWF0aC5wb3coMTAsIHRocmVzaG9sZERiIC8gMjApO1xyXG4gIGNvbnN0IG1pblNpbGVuY2VTYW1wbGVzID0gKG1pblNpbGVuY2VEdXJhdGlvbk1zIC8gMTAwMCkgKiBzYW1wbGVSYXRlO1xyXG5cclxuICBjb25zdCBzZWdtZW50czogQ3V0U2VnbWVudFtdID0gW107XHJcbiAgbGV0IGlzU2lsZW5jZSA9IGZhbHNlO1xyXG4gIGxldCBzaWxlbmNlU3RhcnQgPSAwO1xyXG5cclxuICAvLyBDcmVhdGUgd2luZG93cyBmb3IgYW5hbHlzaXMgKGUuZy4sIDEwMG1zKSB0byBzbW9vdGggb3V0IGluc3RhbnQgZHJvcHNcclxuICBjb25zdCB3aW5kb3dTaXplID0gTWF0aC5mbG9vcihzYW1wbGVSYXRlIC8gMTApO1xyXG4gIGNvbnN0IHdpbmRvd3MgPSBNYXRoLmZsb29yKGF1ZGlvRGF0YS5sZW5ndGggLyB3aW5kb3dTaXplKTtcclxuXHJcbiAgbGV0IGN1cnJlbnRTdGFydCA9IDA7XHJcblxyXG4gIC8vIFdlIHdpbGwgaXRlcmF0ZSBzYW1wbGUgYnkgc2FtcGxlIG9yIHdpbmRvdyBieSB3aW5kb3c/XHJcbiAgLy8gV2luZG93IGJ5IHdpbmRvdyBpcyBmYXN0ZXIgYW5kIHN1ZmZpY2llbnQgZm9yIFwiSnVtcCBDdXRcIi5cclxuICAvLyBMZXQncyB1c2UgYSBzbWFsbGVyIHdpbmRvdyBsaWtlIDEwbXMgZm9yIHByZWNpc2lvbiAoc2FtcGxlUmF0ZSAvIDEwMClcclxuICBjb25zdCBwcmVjaXNlV2luZG93ID0gTWF0aC5mbG9vcihzYW1wbGVSYXRlIC8gMTAwKTtcclxuXHJcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdWRpb0RhdGEubGVuZ3RoOyBpICs9IHByZWNpc2VXaW5kb3cpIHtcclxuICAgIGNvbnN0IGVuZCA9IE1hdGgubWluKGkgKyBwcmVjaXNlV2luZG93LCBhdWRpb0RhdGEubGVuZ3RoKTtcclxuICAgIGNvbnN0IGNodW5rID0gYXVkaW9EYXRhLnNsaWNlKGksIGVuZCk7XHJcblxyXG4gICAgLy8gQ2FsY3VsYXRlIFJNUyBvZiBjaHVua1xyXG4gICAgbGV0IHN1bSA9IDA7XHJcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IGNodW5rLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgIHN1bSArPSBjaHVua1tqXSAqIGNodW5rW2pdO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgcm1zID0gTWF0aC5zcXJ0KHN1bSAvIGNodW5rLmxlbmd0aCk7XHJcblxyXG4gICAgY29uc3QgaXNCZWxvd1RocmVzaG9sZCA9IHJtcyA8IHRocmVzaG9sZDtcclxuXHJcbiAgICAvLyBTaW1wbGUgc3RhdGUgbWFjaGluZVxyXG4gICAgaWYgKGlzQmVsb3dUaHJlc2hvbGQgJiYgIWlzU2lsZW5jZSkge1xyXG4gICAgICBpc1NpbGVuY2UgPSB0cnVlO1xyXG4gICAgICBzaWxlbmNlU3RhcnQgPSBpO1xyXG4gICAgfSBlbHNlIGlmICghaXNCZWxvd1RocmVzaG9sZCAmJiBpc1NpbGVuY2UpIHtcclxuICAgICAgLy8gRW5kIG9mIHNpbGVuY2VcclxuICAgICAgaXNTaWxlbmNlID0gZmFsc2U7XHJcbiAgICAgIGNvbnN0IGR1cmF0aW9uU2FtcGxlcyA9IGkgLSBzaWxlbmNlU3RhcnQ7XHJcblxyXG4gICAgICBpZiAoZHVyYXRpb25TYW1wbGVzID49IG1pblNpbGVuY2VTYW1wbGVzKSB7XHJcbiAgICAgICAgLy8gSXQgd2FzIGEgdmFsaWQgc2lsZW5jZVxyXG4gICAgICAgIC8vIFB1c2ggcHJldmlvdXMgS0VFUCBzZWdtZW50IGlmIGV4aXN0c1xyXG4gICAgICAgIGlmIChzaWxlbmNlU3RhcnQgPiBjdXJyZW50U3RhcnQpIHtcclxuICAgICAgICAgIHNlZ21lbnRzLnB1c2goe1xyXG4gICAgICAgICAgICBzdGFydDogY3VycmVudFN0YXJ0IC8gc2FtcGxlUmF0ZSxcclxuICAgICAgICAgICAgZW5kOiBzaWxlbmNlU3RhcnQgLyBzYW1wbGVSYXRlLFxyXG4gICAgICAgICAgICB0eXBlOiBcImtlZXBcIixcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBQdXNoIFNJTEVOQ0Ugc2VnbWVudFxyXG4gICAgICAgIHNlZ21lbnRzLnB1c2goe1xyXG4gICAgICAgICAgc3RhcnQ6IHNpbGVuY2VTdGFydCAvIHNhbXBsZVJhdGUsXHJcbiAgICAgICAgICBlbmQ6IGkgLyBzYW1wbGVSYXRlLFxyXG4gICAgICAgICAgdHlwZTogXCJzaWxlbmNlXCIsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY3VycmVudFN0YXJ0ID0gaTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBJZ25vcmVkIHNpbGVuY2UgKHRvbyBzaG9ydCksIHRyZWF0ZWQgYXMga2VlcFxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBGaW5hbCBzZWdtZW50XHJcbiAgaWYgKGN1cnJlbnRTdGFydCA8IGF1ZGlvRGF0YS5sZW5ndGgpIHtcclxuICAgIHNlZ21lbnRzLnB1c2goe1xyXG4gICAgICBzdGFydDogY3VycmVudFN0YXJ0IC8gc2FtcGxlUmF0ZSxcclxuICAgICAgZW5kOiBhdWRpb0RhdGEubGVuZ3RoIC8gc2FtcGxlUmF0ZSxcclxuICAgICAgdHlwZTogXCJrZWVwXCIsIC8vIFNob3VsZCB3ZSBjaGVjayBpZiB0aGUgdGFpbCBpcyBzaWxlbmNlP1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gc2VnbWVudHM7XHJcbn1cclxuXHJcbnNlbGYub25tZXNzYWdlID0gYXN5bmMgKGU6IE1lc3NhZ2VFdmVudCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCB7IHR5cGUsIHBheWxvYWQgfSA9IGUuZGF0YTtcclxuXHJcbiAgICBpZiAodHlwZSA9PT0gXCJhbmFseXplXCIpIHtcclxuICAgICAgY29uc3QgeyBhdWRpb0RhdGEsIHRyYW5zY3JpcHQsIGR1cmF0aW9uLCBzYW1wbGVSYXRlIH0gPSBwYXlsb2FkO1xyXG5cclxuICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogXCJzdGF0dXNcIixcclxuICAgICAgICBzdGFnZTogXCJwcm9jZXNzXCIsXHJcbiAgICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIkFuYWx5emluZyBhdWRpbyBwZWFrcy4uLlwiIH0sXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgY29uc3QgcGVha3MgPSBhbmFseXplQXVkaW9QZWFrcyhhdWRpb0RhdGEsIHNhbXBsZVJhdGUpO1xyXG5cclxuICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogXCJwcm9ncmVzc1wiLFxyXG4gICAgICAgIHN0YWdlOiBcInByb2Nlc3NcIixcclxuICAgICAgICBwYXlsb2FkOiB7IHByb2dyZXNzOiA1MCwgbWVzc2FnZTogXCJBbmFseXppbmcgc3BlZWNoIGRlbnNpdHkuLi5cIiB9LFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHNwZWVjaERlbnNpdHkgPSBhbmFseXplU3BlZWNoRGVuc2l0eSh0cmFuc2NyaXB0LCBkdXJhdGlvbik7XHJcblxyXG4gICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICB0eXBlOiBcInByb2dyZXNzXCIsXHJcbiAgICAgICAgc3RhZ2U6IFwicHJvY2Vzc1wiLFxyXG4gICAgICAgIHBheWxvYWQ6IHsgcHJvZ3Jlc3M6IDgwLCBtZXNzYWdlOiBcIkdlbmVyYXRpbmcgc3VnZ2VzdGlvbnMuLi5cIiB9LFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGNvbnN0IHN1Z2dlc3Rpb25zID0gZ2VuZXJhdGVTdWdnZXN0aW9ucyhwZWFrcywgc3BlZWNoRGVuc2l0eSwgZHVyYXRpb24pO1xyXG5cclxuICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogXCJjb21wbGV0ZVwiLFxyXG4gICAgICAgIHN0YWdlOiBcInByb2Nlc3NcIixcclxuICAgICAgICBwYXlsb2FkOiB7IHN1Z2dlc3Rpb25zIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlID09PSBcImRldGVjdF9zaWxlbmNlXCIpIHtcclxuICAgICAgY29uc3QgeyBhdWRpb0RhdGEsIHNhbXBsZVJhdGUsIHRocmVzaG9sZERiLCBtaW5TaWxlbmNlRHVyYXRpb25NcyB9ID1cclxuICAgICAgICBwYXlsb2FkO1xyXG5cclxuICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgdHlwZTogXCJzdGF0dXNcIixcclxuICAgICAgICBzdGFnZTogXCJwcm9jZXNzXCIsXHJcbiAgICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIkRldGVjdGluZyBzaWxlbmNlLi4uXCIgfSxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCBzZWdtZW50cyA9IGRldGVjdFNpbGVuY2UoXHJcbiAgICAgICAgYXVkaW9EYXRhLFxyXG4gICAgICAgIHNhbXBsZVJhdGUsXHJcbiAgICAgICAgdGhyZXNob2xkRGIsXHJcbiAgICAgICAgbWluU2lsZW5jZUR1cmF0aW9uTXMsXHJcbiAgICAgICk7XHJcblxyXG4gICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICB0eXBlOiBcInNpbGVuY2VfZGV0ZWN0ZWRcIiwgLy8gTmV3IG1lc3NhZ2UgdHlwZVxyXG4gICAgICAgIHN0YWdlOiBcImNvbXBsZXRlXCIsXHJcbiAgICAgICAgcGF5bG9hZDogeyBzZWdtZW50cyB9LFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgIHR5cGU6IFwiZXJyb3JcIixcclxuICAgICAgc3RhZ2U6IFwicHJvY2Vzc1wiLFxyXG4gICAgICBwYXlsb2FkOiB7XHJcbiAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIlVua25vd24gZXJyb3JcIixcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxufTtcclxuIl0sIm5hbWVzIjpbImFuYWx5emVBdWRpb1BlYWtzIiwiYXVkaW9EYXRhIiwic2FtcGxlUmF0ZSIsIndpbmRvd1NpemUiLCJwZWFrcyIsImkiLCJsZW5ndGgiLCJ3aW5kb3ciLCJzbGljZSIsInJtcyIsIk1hdGgiLCJzcXJ0IiwicmVkdWNlIiwic3VtIiwidmFsIiwicHVzaCIsImFuYWx5emVTcGVlY2hEZW5zaXR5IiwidHJhbnNjcmlwdCIsImR1cmF0aW9uIiwid2luZG93cyIsImNlaWwiLCJkZW5zaXR5IiwiQXJyYXkiLCJmaWxsIiwic2VnbWVudCIsInN0YXJ0V2luZG93IiwiZmxvb3IiLCJzdGFydCIsImVuZFdpbmRvdyIsImVuZCIsIndvcmRDb3VudCIsInRleHQiLCJzcGxpdCIsInNlZ21lbnREdXJhdGlvbiIsIm1heCIsIndvcmRzUGVyU2Vjb25kIiwidyIsImdlbmVyYXRlU3VnZ2VzdGlvbnMiLCJzcGVlY2hEZW5zaXR5IiwidGFyZ2V0Q2xpcExlbmd0aCIsInN1Z2dlc3Rpb25zIiwibWF4UGVhayIsIm1heERlbnNpdHkiLCJub3JtYWxpemVkUGVha3MiLCJtYXAiLCJwIiwibm9ybWFsaXplZERlbnNpdHkiLCJkIiwiY2xpcFNjb3JlcyIsIndpbmRvd1BlYWtzIiwid2luZG93RGVuc2l0eSIsImF2Z1BlYWsiLCJhIiwiYiIsImF2Z0RlbnNpdHkiLCJwZWFrVmFyaWFuY2UiLCJtaW4iLCJjb21wb3NpdGVTY29yZSIsInNjb3JlIiwic2NvcmVzIiwiYXVkaW9QZWFrIiwibW90aW9uIiwic29ydCIsImNsaXAiLCJvdmVybGFwcyIsInNvbWUiLCJzIiwiYWJzIiwicmVhc29uaW5nIiwiZ2VuZXJhdGVWaXJhbFJlYXNvbmluZyIsImlkIiwiY29uZmlkZW5jZSIsInJvdW5kIiwicmVhc29uIiwiZ2VuZXJhdGVSZWFzb24iLCJ2aXJhbFJlYXNvbmluZyIsImV4cGxhbmF0aW9uIiwic3VnZ2VzdGVkQ2FwdGlvbnMiLCJjYXB0aW9ucyIsImF1dG9tYXRpb25fc3RhdHVzIiwicmVhc29ucyIsImpvaW4iLCJob29rcyIsInNlbGVjdGVkSG9va3MiLCJyYW5kb20iLCJkZXRlY3RTaWxlbmNlIiwidGhyZXNob2xkRGIiLCJtaW5TaWxlbmNlRHVyYXRpb25NcyIsInRocmVzaG9sZCIsInBvdyIsIm1pblNpbGVuY2VTYW1wbGVzIiwic2VnbWVudHMiLCJpc1NpbGVuY2UiLCJzaWxlbmNlU3RhcnQiLCJjdXJyZW50U3RhcnQiLCJwcmVjaXNlV2luZG93IiwiY2h1bmsiLCJqIiwiaXNCZWxvd1RocmVzaG9sZCIsImR1cmF0aW9uU2FtcGxlcyIsInR5cGUiLCJzZWxmIiwib25tZXNzYWdlIiwiZSIsInBheWxvYWQiLCJkYXRhIiwicG9zdE1lc3NhZ2UiLCJzdGFnZSIsIm1lc3NhZ2UiLCJwcm9ncmVzcyIsImVycm9yIiwiRXJyb3IiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(app-pages-browser)/./src/workers/analysis.worker.ts\n"));

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			if (cachedModule.error !== undefined) throw cachedModule.error;
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			var execOptions = { id: moduleId, module: module, factory: __webpack_modules__[moduleId], require: __webpack_require__ };
/******/ 			__webpack_require__.i.forEach(function(handler) { handler(execOptions); });
/******/ 			module = execOptions.module;
/******/ 			execOptions.factory.call(module.exports, module, module.exports, execOptions.require);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = __webpack_module_cache__;
/******/ 	
/******/ 	// expose the module execution interceptor
/******/ 	__webpack_require__.i = [];
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/get javascript update chunk filename */
/******/ 	!function() {
/******/ 		// This function allow to reference all chunks
/******/ 		__webpack_require__.hu = function(chunkId) {
/******/ 			// return url for filenames based on template
/******/ 			return "static/webpack/" + chunkId + "." + __webpack_require__.h() + ".hot-update.js";
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/get mini-css chunk filename */
/******/ 	!function() {
/******/ 		// This function allow to reference async chunks
/******/ 		__webpack_require__.miniCssF = function(chunkId) {
/******/ 			// return url for filenames based on template
/******/ 			return undefined;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/get update manifest filename */
/******/ 	!function() {
/******/ 		__webpack_require__.hmrF = function() { return "static/webpack/" + __webpack_require__.h() + ".03c5be9236ba10e2.hot-update.json"; };
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/getFullHash */
/******/ 	!function() {
/******/ 		__webpack_require__.h = function() { return "17a4996fada2f8c8"; }
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	!function() {
/******/ 		__webpack_require__.o = function(obj, prop) { return Object.prototype.hasOwnProperty.call(obj, prop); }
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/trusted types policy */
/******/ 	!function() {
/******/ 		var policy;
/******/ 		__webpack_require__.tt = function() {
/******/ 			// Create Trusted Type policy if Trusted Types are available and the policy doesn't exist yet.
/******/ 			if (policy === undefined) {
/******/ 				policy = {
/******/ 					createScript: function(script) { return script; },
/******/ 					createScriptURL: function(url) { return url; }
/******/ 				};
/******/ 				if (typeof trustedTypes !== "undefined" && trustedTypes.createPolicy) {
/******/ 					policy = trustedTypes.createPolicy("nextjs#bundler", policy);
/******/ 				}
/******/ 			}
/******/ 			return policy;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/trusted types script */
/******/ 	!function() {
/******/ 		__webpack_require__.ts = function(script) { return __webpack_require__.tt().createScript(script); };
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/trusted types script url */
/******/ 	!function() {
/******/ 		__webpack_require__.tu = function(url) { return __webpack_require__.tt().createScriptURL(url); };
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/hot module replacement */
/******/ 	!function() {
/******/ 		var currentModuleData = {};
/******/ 		var installedModules = __webpack_require__.c;
/******/ 		
/******/ 		// module and require creation
/******/ 		var currentChildModule;
/******/ 		var currentParents = [];
/******/ 		
/******/ 		// status
/******/ 		var registeredStatusHandlers = [];
/******/ 		var currentStatus = "idle";
/******/ 		
/******/ 		// while downloading
/******/ 		var blockingPromises = 0;
/******/ 		var blockingPromisesWaiting = [];
/******/ 		
/******/ 		// The update info
/******/ 		var currentUpdateApplyHandlers;
/******/ 		var queuedInvalidatedModules;
/******/ 		
/******/ 		__webpack_require__.hmrD = currentModuleData;
/******/ 		
/******/ 		__webpack_require__.i.push(function (options) {
/******/ 			var module = options.module;
/******/ 			var require = createRequire(options.require, options.id);
/******/ 			module.hot = createModuleHotObject(options.id, module);
/******/ 			module.parents = currentParents;
/******/ 			module.children = [];
/******/ 			currentParents = [];
/******/ 			options.require = require;
/******/ 		});
/******/ 		
/******/ 		__webpack_require__.hmrC = {};
/******/ 		__webpack_require__.hmrI = {};
/******/ 		
/******/ 		function createRequire(require, moduleId) {
/******/ 			var me = installedModules[moduleId];
/******/ 			if (!me) return require;
/******/ 			var fn = function (request) {
/******/ 				if (me.hot.active) {
/******/ 					if (installedModules[request]) {
/******/ 						var parents = installedModules[request].parents;
/******/ 						if (parents.indexOf(moduleId) === -1) {
/******/ 							parents.push(moduleId);
/******/ 						}
/******/ 					} else {
/******/ 						currentParents = [moduleId];
/******/ 						currentChildModule = request;
/******/ 					}
/******/ 					if (me.children.indexOf(request) === -1) {
/******/ 						me.children.push(request);
/******/ 					}
/******/ 				} else {
/******/ 					console.warn(
/******/ 						"[HMR] unexpected require(" +
/******/ 							request +
/******/ 							") from disposed module " +
/******/ 							moduleId
/******/ 					);
/******/ 					currentParents = [];
/******/ 				}
/******/ 				return require(request);
/******/ 			};
/******/ 			var createPropertyDescriptor = function (name) {
/******/ 				return {
/******/ 					configurable: true,
/******/ 					enumerable: true,
/******/ 					get: function () {
/******/ 						return require[name];
/******/ 					},
/******/ 					set: function (value) {
/******/ 						require[name] = value;
/******/ 					}
/******/ 				};
/******/ 			};
/******/ 			for (var name in require) {
/******/ 				if (Object.prototype.hasOwnProperty.call(require, name) && name !== "e") {
/******/ 					Object.defineProperty(fn, name, createPropertyDescriptor(name));
/******/ 				}
/******/ 			}
/******/ 			fn.e = function (chunkId, fetchPriority) {
/******/ 				return trackBlockingPromise(require.e(chunkId, fetchPriority));
/******/ 			};
/******/ 			return fn;
/******/ 		}
/******/ 		
/******/ 		function createModuleHotObject(moduleId, me) {
/******/ 			var _main = currentChildModule !== moduleId;
/******/ 			var hot = {
/******/ 				// private stuff
/******/ 				_acceptedDependencies: {},
/******/ 				_acceptedErrorHandlers: {},
/******/ 				_declinedDependencies: {},
/******/ 				_selfAccepted: false,
/******/ 				_selfDeclined: false,
/******/ 				_selfInvalidated: false,
/******/ 				_disposeHandlers: [],
/******/ 				_main: _main,
/******/ 				_requireSelf: function () {
/******/ 					currentParents = me.parents.slice();
/******/ 					currentChildModule = _main ? undefined : moduleId;
/******/ 					__webpack_require__(moduleId);
/******/ 				},
/******/ 		
/******/ 				// Module API
/******/ 				active: true,
/******/ 				accept: function (dep, callback, errorHandler) {
/******/ 					if (dep === undefined) hot._selfAccepted = true;
/******/ 					else if (typeof dep === "function") hot._selfAccepted = dep;
/******/ 					else if (typeof dep === "object" && dep !== null) {
/******/ 						for (var i = 0; i < dep.length; i++) {
/******/ 							hot._acceptedDependencies[dep[i]] = callback || function () {};
/******/ 							hot._acceptedErrorHandlers[dep[i]] = errorHandler;
/******/ 						}
/******/ 					} else {
/******/ 						hot._acceptedDependencies[dep] = callback || function () {};
/******/ 						hot._acceptedErrorHandlers[dep] = errorHandler;
/******/ 					}
/******/ 				},
/******/ 				decline: function (dep) {
/******/ 					if (dep === undefined) hot._selfDeclined = true;
/******/ 					else if (typeof dep === "object" && dep !== null)
/******/ 						for (var i = 0; i < dep.length; i++)
/******/ 							hot._declinedDependencies[dep[i]] = true;
/******/ 					else hot._declinedDependencies[dep] = true;
/******/ 				},
/******/ 				dispose: function (callback) {
/******/ 					hot._disposeHandlers.push(callback);
/******/ 				},
/******/ 				addDisposeHandler: function (callback) {
/******/ 					hot._disposeHandlers.push(callback);
/******/ 				},
/******/ 				removeDisposeHandler: function (callback) {
/******/ 					var idx = hot._disposeHandlers.indexOf(callback);
/******/ 					if (idx >= 0) hot._disposeHandlers.splice(idx, 1);
/******/ 				},
/******/ 				invalidate: function () {
/******/ 					this._selfInvalidated = true;
/******/ 					switch (currentStatus) {
/******/ 						case "idle":
/******/ 							currentUpdateApplyHandlers = [];
/******/ 							Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 								__webpack_require__.hmrI[key](
/******/ 									moduleId,
/******/ 									currentUpdateApplyHandlers
/******/ 								);
/******/ 							});
/******/ 							setStatus("ready");
/******/ 							break;
/******/ 						case "ready":
/******/ 							Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 								__webpack_require__.hmrI[key](
/******/ 									moduleId,
/******/ 									currentUpdateApplyHandlers
/******/ 								);
/******/ 							});
/******/ 							break;
/******/ 						case "prepare":
/******/ 						case "check":
/******/ 						case "dispose":
/******/ 						case "apply":
/******/ 							(queuedInvalidatedModules = queuedInvalidatedModules || []).push(
/******/ 								moduleId
/******/ 							);
/******/ 							break;
/******/ 						default:
/******/ 							// ignore requests in error states
/******/ 							break;
/******/ 					}
/******/ 				},
/******/ 		
/******/ 				// Management API
/******/ 				check: hotCheck,
/******/ 				apply: hotApply,
/******/ 				status: function (l) {
/******/ 					if (!l) return currentStatus;
/******/ 					registeredStatusHandlers.push(l);
/******/ 				},
/******/ 				addStatusHandler: function (l) {
/******/ 					registeredStatusHandlers.push(l);
/******/ 				},
/******/ 				removeStatusHandler: function (l) {
/******/ 					var idx = registeredStatusHandlers.indexOf(l);
/******/ 					if (idx >= 0) registeredStatusHandlers.splice(idx, 1);
/******/ 				},
/******/ 		
/******/ 				//inherit from previous dispose call
/******/ 				data: currentModuleData[moduleId]
/******/ 			};
/******/ 			currentChildModule = undefined;
/******/ 			return hot;
/******/ 		}
/******/ 		
/******/ 		function setStatus(newStatus) {
/******/ 			currentStatus = newStatus;
/******/ 			var results = [];
/******/ 		
/******/ 			for (var i = 0; i < registeredStatusHandlers.length; i++)
/******/ 				results[i] = registeredStatusHandlers[i].call(null, newStatus);
/******/ 		
/******/ 			return Promise.all(results);
/******/ 		}
/******/ 		
/******/ 		function unblock() {
/******/ 			if (--blockingPromises === 0) {
/******/ 				setStatus("ready").then(function () {
/******/ 					if (blockingPromises === 0) {
/******/ 						var list = blockingPromisesWaiting;
/******/ 						blockingPromisesWaiting = [];
/******/ 						for (var i = 0; i < list.length; i++) {
/******/ 							list[i]();
/******/ 						}
/******/ 					}
/******/ 				});
/******/ 			}
/******/ 		}
/******/ 		
/******/ 		function trackBlockingPromise(promise) {
/******/ 			switch (currentStatus) {
/******/ 				case "ready":
/******/ 					setStatus("prepare");
/******/ 				/* fallthrough */
/******/ 				case "prepare":
/******/ 					blockingPromises++;
/******/ 					promise.then(unblock, unblock);
/******/ 					return promise;
/******/ 				default:
/******/ 					return promise;
/******/ 			}
/******/ 		}
/******/ 		
/******/ 		function waitForBlockingPromises(fn) {
/******/ 			if (blockingPromises === 0) return fn();
/******/ 			return new Promise(function (resolve) {
/******/ 				blockingPromisesWaiting.push(function () {
/******/ 					resolve(fn());
/******/ 				});
/******/ 			});
/******/ 		}
/******/ 		
/******/ 		function hotCheck(applyOnUpdate) {
/******/ 			if (currentStatus !== "idle") {
/******/ 				throw new Error("check() is only allowed in idle status");
/******/ 			}
/******/ 			return setStatus("check")
/******/ 				.then(__webpack_require__.hmrM)
/******/ 				.then(function (update) {
/******/ 					if (!update) {
/******/ 						return setStatus(applyInvalidatedModules() ? "ready" : "idle").then(
/******/ 							function () {
/******/ 								return null;
/******/ 							}
/******/ 						);
/******/ 					}
/******/ 		
/******/ 					return setStatus("prepare").then(function () {
/******/ 						var updatedModules = [];
/******/ 						currentUpdateApplyHandlers = [];
/******/ 		
/******/ 						return Promise.all(
/******/ 							Object.keys(__webpack_require__.hmrC).reduce(function (
/******/ 								promises,
/******/ 								key
/******/ 							) {
/******/ 								__webpack_require__.hmrC[key](
/******/ 									update.c,
/******/ 									update.r,
/******/ 									update.m,
/******/ 									promises,
/******/ 									currentUpdateApplyHandlers,
/******/ 									updatedModules
/******/ 								);
/******/ 								return promises;
/******/ 							}, [])
/******/ 						).then(function () {
/******/ 							return waitForBlockingPromises(function () {
/******/ 								if (applyOnUpdate) {
/******/ 									return internalApply(applyOnUpdate);
/******/ 								} else {
/******/ 									return setStatus("ready").then(function () {
/******/ 										return updatedModules;
/******/ 									});
/******/ 								}
/******/ 							});
/******/ 						});
/******/ 					});
/******/ 				});
/******/ 		}
/******/ 		
/******/ 		function hotApply(options) {
/******/ 			if (currentStatus !== "ready") {
/******/ 				return Promise.resolve().then(function () {
/******/ 					throw new Error(
/******/ 						"apply() is only allowed in ready status (state: " +
/******/ 							currentStatus +
/******/ 							")"
/******/ 					);
/******/ 				});
/******/ 			}
/******/ 			return internalApply(options);
/******/ 		}
/******/ 		
/******/ 		function internalApply(options) {
/******/ 			options = options || {};
/******/ 		
/******/ 			applyInvalidatedModules();
/******/ 		
/******/ 			var results = currentUpdateApplyHandlers.map(function (handler) {
/******/ 				return handler(options);
/******/ 			});
/******/ 			currentUpdateApplyHandlers = undefined;
/******/ 		
/******/ 			var errors = results
/******/ 				.map(function (r) {
/******/ 					return r.error;
/******/ 				})
/******/ 				.filter(Boolean);
/******/ 		
/******/ 			if (errors.length > 0) {
/******/ 				return setStatus("abort").then(function () {
/******/ 					throw errors[0];
/******/ 				});
/******/ 			}
/******/ 		
/******/ 			// Now in "dispose" phase
/******/ 			var disposePromise = setStatus("dispose");
/******/ 		
/******/ 			results.forEach(function (result) {
/******/ 				if (result.dispose) result.dispose();
/******/ 			});
/******/ 		
/******/ 			// Now in "apply" phase
/******/ 			var applyPromise = setStatus("apply");
/******/ 		
/******/ 			var error;
/******/ 			var reportError = function (err) {
/******/ 				if (!error) error = err;
/******/ 			};
/******/ 		
/******/ 			var outdatedModules = [];
/******/ 			results.forEach(function (result) {
/******/ 				if (result.apply) {
/******/ 					var modules = result.apply(reportError);
/******/ 					if (modules) {
/******/ 						for (var i = 0; i < modules.length; i++) {
/******/ 							outdatedModules.push(modules[i]);
/******/ 						}
/******/ 					}
/******/ 				}
/******/ 			});
/******/ 		
/******/ 			return Promise.all([disposePromise, applyPromise]).then(function () {
/******/ 				// handle errors in accept handlers and self accepted module load
/******/ 				if (error) {
/******/ 					return setStatus("fail").then(function () {
/******/ 						throw error;
/******/ 					});
/******/ 				}
/******/ 		
/******/ 				if (queuedInvalidatedModules) {
/******/ 					return internalApply(options).then(function (list) {
/******/ 						outdatedModules.forEach(function (moduleId) {
/******/ 							if (list.indexOf(moduleId) < 0) list.push(moduleId);
/******/ 						});
/******/ 						return list;
/******/ 					});
/******/ 				}
/******/ 		
/******/ 				return setStatus("idle").then(function () {
/******/ 					return outdatedModules;
/******/ 				});
/******/ 			});
/******/ 		}
/******/ 		
/******/ 		function applyInvalidatedModules() {
/******/ 			if (queuedInvalidatedModules) {
/******/ 				if (!currentUpdateApplyHandlers) currentUpdateApplyHandlers = [];
/******/ 				Object.keys(__webpack_require__.hmrI).forEach(function (key) {
/******/ 					queuedInvalidatedModules.forEach(function (moduleId) {
/******/ 						__webpack_require__.hmrI[key](
/******/ 							moduleId,
/******/ 							currentUpdateApplyHandlers
/******/ 						);
/******/ 					});
/******/ 				});
/******/ 				queuedInvalidatedModules = undefined;
/******/ 				return true;
/******/ 			}
/******/ 		}
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	!function() {
/******/ 		__webpack_require__.p = "/_next/";
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/react refresh */
/******/ 	!function() {
/******/ 		if (__webpack_require__.i) {
/******/ 		__webpack_require__.i.push(function(options) {
/******/ 			var originalFactory = options.factory;
/******/ 			options.factory = function(moduleObject, moduleExports, webpackRequire) {
/******/ 				var hasRefresh = typeof self !== "undefined" && !!self.$RefreshInterceptModuleExecution$;
/******/ 				var cleanup = hasRefresh ? self.$RefreshInterceptModuleExecution$(moduleObject.id) : function() {};
/******/ 				try {
/******/ 					originalFactory.call(this, moduleObject, moduleExports, webpackRequire);
/******/ 				} finally {
/******/ 					cleanup();
/******/ 				}
/******/ 			}
/******/ 		})
/******/ 		}
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	
/******/ 	// noop fns to prevent runtime errors during initialization
/******/ 	if (typeof self !== "undefined") {
/******/ 		self.$RefreshReg$ = function () {};
/******/ 		self.$RefreshSig$ = function () {
/******/ 			return function (type) {
/******/ 				return type;
/******/ 			};
/******/ 		};
/******/ 	}
/******/ 	
/******/ 	/* webpack/runtime/css loading */
/******/ 	!function() {
/******/ 		var createStylesheet = function(chunkId, fullhref, resolve, reject) {
/******/ 			var linkTag = document.createElement("link");
/******/ 		
/******/ 			linkTag.rel = "stylesheet";
/******/ 			linkTag.type = "text/css";
/******/ 			var onLinkComplete = function(event) {
/******/ 				// avoid mem leaks.
/******/ 				linkTag.onerror = linkTag.onload = null;
/******/ 				if (event.type === 'load') {
/******/ 					resolve();
/******/ 				} else {
/******/ 					var errorType = event && (event.type === 'load' ? 'missing' : event.type);
/******/ 					var realHref = event && event.target && event.target.href || fullhref;
/******/ 					var err = new Error("Loading CSS chunk " + chunkId + " failed.\n(" + realHref + ")");
/******/ 					err.code = "CSS_CHUNK_LOAD_FAILED";
/******/ 					err.type = errorType;
/******/ 					err.request = realHref;
/******/ 					linkTag.parentNode.removeChild(linkTag)
/******/ 					reject(err);
/******/ 				}
/******/ 			}
/******/ 			linkTag.onerror = linkTag.onload = onLinkComplete;
/******/ 			linkTag.href = fullhref;
/******/ 		
/******/ 			document.head.appendChild(linkTag);
/******/ 			return linkTag;
/******/ 		};
/******/ 		var findStylesheet = function(href, fullhref) {
/******/ 			var existingLinkTags = document.getElementsByTagName("link");
/******/ 			for(var i = 0; i < existingLinkTags.length; i++) {
/******/ 				var tag = existingLinkTags[i];
/******/ 				var dataHref = tag.getAttribute("data-href") || tag.getAttribute("href");
/******/ 				if(tag.rel === "stylesheet" && (dataHref === href || dataHref === fullhref)) return tag;
/******/ 			}
/******/ 			var existingStyleTags = document.getElementsByTagName("style");
/******/ 			for(var i = 0; i < existingStyleTags.length; i++) {
/******/ 				var tag = existingStyleTags[i];
/******/ 				var dataHref = tag.getAttribute("data-href");
/******/ 				if(dataHref === href || dataHref === fullhref) return tag;
/******/ 			}
/******/ 		};
/******/ 		var loadStylesheet = function(chunkId) {
/******/ 			return new Promise(function(resolve, reject) {
/******/ 				var href = __webpack_require__.miniCssF(chunkId);
/******/ 				var fullhref = __webpack_require__.p + href;
/******/ 				if(findStylesheet(href, fullhref)) return resolve();
/******/ 				createStylesheet(chunkId, fullhref, resolve, reject);
/******/ 			});
/******/ 		}
/******/ 		// no chunk loading
/******/ 		
/******/ 		var oldTags = [];
/******/ 		var newTags = [];
/******/ 		var applyHandler = function(options) {
/******/ 			return { dispose: function() {
/******/ 				for(var i = 0; i < oldTags.length; i++) {
/******/ 					var oldTag = oldTags[i];
/******/ 					if(oldTag.parentNode) oldTag.parentNode.removeChild(oldTag);
/******/ 				}
/******/ 				oldTags.length = 0;
/******/ 			}, apply: function() {
/******/ 				for(var i = 0; i < newTags.length; i++) newTags[i].rel = "stylesheet";
/******/ 				newTags.length = 0;
/******/ 			} };
/******/ 		}
/******/ 		__webpack_require__.hmrC.miniCss = function(chunkIds, removedChunks, removedModules, promises, applyHandlers, updatedModulesList) {
/******/ 			applyHandlers.push(applyHandler);
/******/ 			chunkIds.forEach(function(chunkId) {
/******/ 				var href = __webpack_require__.miniCssF(chunkId);
/******/ 				var fullhref = __webpack_require__.p + href;
/******/ 				var oldTag = findStylesheet(href, fullhref);
/******/ 				if(!oldTag) return;
/******/ 				promises.push(new Promise(function(resolve, reject) {
/******/ 					var tag = createStylesheet(chunkId, fullhref, function() {
/******/ 						tag.as = "style";
/******/ 						tag.rel = "preload";
/******/ 						resolve();
/******/ 					}, reject);
/******/ 					oldTags.push(oldTag);
/******/ 					newTags.push(tag);
/******/ 				}));
/******/ 			});
/******/ 		}
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/importScripts chunk loading */
/******/ 	!function() {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "already loaded"
/******/ 		var installedChunks = __webpack_require__.hmrS_importScripts = __webpack_require__.hmrS_importScripts || {
/******/ 			"_app-pages-browser_src_workers_analysis_worker_ts": 1
/******/ 		};
/******/ 		
/******/ 		// no chunk install function needed
/******/ 		// no chunk loading
/******/ 		
/******/ 		function loadUpdateChunk(chunkId, updatedModulesList) {
/******/ 			var success = false;
/******/ 			self["webpackHotUpdate_N_E"] = function(_, moreModules, runtime) {
/******/ 				for(var moduleId in moreModules) {
/******/ 					if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 						currentUpdate[moduleId] = moreModules[moduleId];
/******/ 						if(updatedModulesList) updatedModulesList.push(moduleId);
/******/ 					}
/******/ 				}
/******/ 				if(runtime) currentUpdateRuntime.push(runtime);
/******/ 				success = true;
/******/ 			};
/******/ 			// start update chunk loading
/******/ 			importScripts(__webpack_require__.tu(__webpack_require__.p + __webpack_require__.hu(chunkId)));
/******/ 			if(!success) throw new Error("Loading update chunk failed for unknown reason");
/******/ 		}
/******/ 		
/******/ 		var currentUpdateChunks;
/******/ 		var currentUpdate;
/******/ 		var currentUpdateRemovedChunks;
/******/ 		var currentUpdateRuntime;
/******/ 		function applyHandler(options) {
/******/ 			if (__webpack_require__.f) delete __webpack_require__.f.importScriptsHmr;
/******/ 			currentUpdateChunks = undefined;
/******/ 			function getAffectedModuleEffects(updateModuleId) {
/******/ 				var outdatedModules = [updateModuleId];
/******/ 				var outdatedDependencies = {};
/******/ 		
/******/ 				var queue = outdatedModules.map(function (id) {
/******/ 					return {
/******/ 						chain: [id],
/******/ 						id: id
/******/ 					};
/******/ 				});
/******/ 				while (queue.length > 0) {
/******/ 					var queueItem = queue.pop();
/******/ 					var moduleId = queueItem.id;
/******/ 					var chain = queueItem.chain;
/******/ 					var module = __webpack_require__.c[moduleId];
/******/ 					if (
/******/ 						!module ||
/******/ 						(module.hot._selfAccepted && !module.hot._selfInvalidated)
/******/ 					)
/******/ 						continue;
/******/ 					if (module.hot._selfDeclined) {
/******/ 						return {
/******/ 							type: "self-declined",
/******/ 							chain: chain,
/******/ 							moduleId: moduleId
/******/ 						};
/******/ 					}
/******/ 					if (module.hot._main) {
/******/ 						return {
/******/ 							type: "unaccepted",
/******/ 							chain: chain,
/******/ 							moduleId: moduleId
/******/ 						};
/******/ 					}
/******/ 					for (var i = 0; i < module.parents.length; i++) {
/******/ 						var parentId = module.parents[i];
/******/ 						var parent = __webpack_require__.c[parentId];
/******/ 						if (!parent) continue;
/******/ 						if (parent.hot._declinedDependencies[moduleId]) {
/******/ 							return {
/******/ 								type: "declined",
/******/ 								chain: chain.concat([parentId]),
/******/ 								moduleId: moduleId,
/******/ 								parentId: parentId
/******/ 							};
/******/ 						}
/******/ 						if (outdatedModules.indexOf(parentId) !== -1) continue;
/******/ 						if (parent.hot._acceptedDependencies[moduleId]) {
/******/ 							if (!outdatedDependencies[parentId])
/******/ 								outdatedDependencies[parentId] = [];
/******/ 							addAllToSet(outdatedDependencies[parentId], [moduleId]);
/******/ 							continue;
/******/ 						}
/******/ 						delete outdatedDependencies[parentId];
/******/ 						outdatedModules.push(parentId);
/******/ 						queue.push({
/******/ 							chain: chain.concat([parentId]),
/******/ 							id: parentId
/******/ 						});
/******/ 					}
/******/ 				}
/******/ 		
/******/ 				return {
/******/ 					type: "accepted",
/******/ 					moduleId: updateModuleId,
/******/ 					outdatedModules: outdatedModules,
/******/ 					outdatedDependencies: outdatedDependencies
/******/ 				};
/******/ 			}
/******/ 		
/******/ 			function addAllToSet(a, b) {
/******/ 				for (var i = 0; i < b.length; i++) {
/******/ 					var item = b[i];
/******/ 					if (a.indexOf(item) === -1) a.push(item);
/******/ 				}
/******/ 			}
/******/ 		
/******/ 			// at begin all updates modules are outdated
/******/ 			// the "outdated" status can propagate to parents if they don't accept the children
/******/ 			var outdatedDependencies = {};
/******/ 			var outdatedModules = [];
/******/ 			var appliedUpdate = {};
/******/ 		
/******/ 			var warnUnexpectedRequire = function warnUnexpectedRequire(module) {
/******/ 				console.warn(
/******/ 					"[HMR] unexpected require(" + module.id + ") to disposed module"
/******/ 				);
/******/ 			};
/******/ 		
/******/ 			for (var moduleId in currentUpdate) {
/******/ 				if (__webpack_require__.o(currentUpdate, moduleId)) {
/******/ 					var newModuleFactory = currentUpdate[moduleId];
/******/ 					/** @type {TODO} */
/******/ 					var result;
/******/ 					if (newModuleFactory) {
/******/ 						result = getAffectedModuleEffects(moduleId);
/******/ 					} else {
/******/ 						result = {
/******/ 							type: "disposed",
/******/ 							moduleId: moduleId
/******/ 						};
/******/ 					}
/******/ 					/** @type {Error|false} */
/******/ 					var abortError = false;
/******/ 					var doApply = false;
/******/ 					var doDispose = false;
/******/ 					var chainInfo = "";
/******/ 					if (result.chain) {
/******/ 						chainInfo = "\nUpdate propagation: " + result.chain.join(" -> ");
/******/ 					}
/******/ 					switch (result.type) {
/******/ 						case "self-declined":
/******/ 							if (options.onDeclined) options.onDeclined(result);
/******/ 							if (!options.ignoreDeclined)
/******/ 								abortError = new Error(
/******/ 									"Aborted because of self decline: " +
/******/ 										result.moduleId +
/******/ 										chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "declined":
/******/ 							if (options.onDeclined) options.onDeclined(result);
/******/ 							if (!options.ignoreDeclined)
/******/ 								abortError = new Error(
/******/ 									"Aborted because of declined dependency: " +
/******/ 										result.moduleId +
/******/ 										" in " +
/******/ 										result.parentId +
/******/ 										chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "unaccepted":
/******/ 							if (options.onUnaccepted) options.onUnaccepted(result);
/******/ 							if (!options.ignoreUnaccepted)
/******/ 								abortError = new Error(
/******/ 									"Aborted because " + moduleId + " is not accepted" + chainInfo
/******/ 								);
/******/ 							break;
/******/ 						case "accepted":
/******/ 							if (options.onAccepted) options.onAccepted(result);
/******/ 							doApply = true;
/******/ 							break;
/******/ 						case "disposed":
/******/ 							if (options.onDisposed) options.onDisposed(result);
/******/ 							doDispose = true;
/******/ 							break;
/******/ 						default:
/******/ 							throw new Error("Unexception type " + result.type);
/******/ 					}
/******/ 					if (abortError) {
/******/ 						return {
/******/ 							error: abortError
/******/ 						};
/******/ 					}
/******/ 					if (doApply) {
/******/ 						appliedUpdate[moduleId] = newModuleFactory;
/******/ 						addAllToSet(outdatedModules, result.outdatedModules);
/******/ 						for (moduleId in result.outdatedDependencies) {
/******/ 							if (__webpack_require__.o(result.outdatedDependencies, moduleId)) {
/******/ 								if (!outdatedDependencies[moduleId])
/******/ 									outdatedDependencies[moduleId] = [];
/******/ 								addAllToSet(
/******/ 									outdatedDependencies[moduleId],
/******/ 									result.outdatedDependencies[moduleId]
/******/ 								);
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 					if (doDispose) {
/******/ 						addAllToSet(outdatedModules, [result.moduleId]);
/******/ 						appliedUpdate[moduleId] = warnUnexpectedRequire;
/******/ 					}
/******/ 				}
/******/ 			}
/******/ 			currentUpdate = undefined;
/******/ 		
/******/ 			// Store self accepted outdated modules to require them later by the module system
/******/ 			var outdatedSelfAcceptedModules = [];
/******/ 			for (var j = 0; j < outdatedModules.length; j++) {
/******/ 				var outdatedModuleId = outdatedModules[j];
/******/ 				var module = __webpack_require__.c[outdatedModuleId];
/******/ 				if (
/******/ 					module &&
/******/ 					(module.hot._selfAccepted || module.hot._main) &&
/******/ 					// removed self-accepted modules should not be required
/******/ 					appliedUpdate[outdatedModuleId] !== warnUnexpectedRequire &&
/******/ 					// when called invalidate self-accepting is not possible
/******/ 					!module.hot._selfInvalidated
/******/ 				) {
/******/ 					outdatedSelfAcceptedModules.push({
/******/ 						module: outdatedModuleId,
/******/ 						require: module.hot._requireSelf,
/******/ 						errorHandler: module.hot._selfAccepted
/******/ 					});
/******/ 				}
/******/ 			}
/******/ 		
/******/ 			var moduleOutdatedDependencies;
/******/ 		
/******/ 			return {
/******/ 				dispose: function () {
/******/ 					currentUpdateRemovedChunks.forEach(function (chunkId) {
/******/ 						delete installedChunks[chunkId];
/******/ 					});
/******/ 					currentUpdateRemovedChunks = undefined;
/******/ 		
/******/ 					var idx;
/******/ 					var queue = outdatedModules.slice();
/******/ 					while (queue.length > 0) {
/******/ 						var moduleId = queue.pop();
/******/ 						var module = __webpack_require__.c[moduleId];
/******/ 						if (!module) continue;
/******/ 		
/******/ 						var data = {};
/******/ 		
/******/ 						// Call dispose handlers
/******/ 						var disposeHandlers = module.hot._disposeHandlers;
/******/ 						for (j = 0; j < disposeHandlers.length; j++) {
/******/ 							disposeHandlers[j].call(null, data);
/******/ 						}
/******/ 						__webpack_require__.hmrD[moduleId] = data;
/******/ 		
/******/ 						// disable module (this disables requires from this module)
/******/ 						module.hot.active = false;
/******/ 		
/******/ 						// remove module from cache
/******/ 						delete __webpack_require__.c[moduleId];
/******/ 		
/******/ 						// when disposing there is no need to call dispose handler
/******/ 						delete outdatedDependencies[moduleId];
/******/ 		
/******/ 						// remove "parents" references from all children
/******/ 						for (j = 0; j < module.children.length; j++) {
/******/ 							var child = __webpack_require__.c[module.children[j]];
/******/ 							if (!child) continue;
/******/ 							idx = child.parents.indexOf(moduleId);
/******/ 							if (idx >= 0) {
/******/ 								child.parents.splice(idx, 1);
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// remove outdated dependency from module children
/******/ 					var dependency;
/******/ 					for (var outdatedModuleId in outdatedDependencies) {
/******/ 						if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
/******/ 							module = __webpack_require__.c[outdatedModuleId];
/******/ 							if (module) {
/******/ 								moduleOutdatedDependencies =
/******/ 									outdatedDependencies[outdatedModuleId];
/******/ 								for (j = 0; j < moduleOutdatedDependencies.length; j++) {
/******/ 									dependency = moduleOutdatedDependencies[j];
/******/ 									idx = module.children.indexOf(dependency);
/******/ 									if (idx >= 0) module.children.splice(idx, 1);
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 				},
/******/ 				apply: function (reportError) {
/******/ 					// insert new code
/******/ 					for (var updateModuleId in appliedUpdate) {
/******/ 						if (__webpack_require__.o(appliedUpdate, updateModuleId)) {
/******/ 							__webpack_require__.m[updateModuleId] = appliedUpdate[updateModuleId];
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// run new runtime modules
/******/ 					for (var i = 0; i < currentUpdateRuntime.length; i++) {
/******/ 						currentUpdateRuntime[i](__webpack_require__);
/******/ 					}
/******/ 		
/******/ 					// call accept handlers
/******/ 					for (var outdatedModuleId in outdatedDependencies) {
/******/ 						if (__webpack_require__.o(outdatedDependencies, outdatedModuleId)) {
/******/ 							var module = __webpack_require__.c[outdatedModuleId];
/******/ 							if (module) {
/******/ 								moduleOutdatedDependencies =
/******/ 									outdatedDependencies[outdatedModuleId];
/******/ 								var callbacks = [];
/******/ 								var errorHandlers = [];
/******/ 								var dependenciesForCallbacks = [];
/******/ 								for (var j = 0; j < moduleOutdatedDependencies.length; j++) {
/******/ 									var dependency = moduleOutdatedDependencies[j];
/******/ 									var acceptCallback =
/******/ 										module.hot._acceptedDependencies[dependency];
/******/ 									var errorHandler =
/******/ 										module.hot._acceptedErrorHandlers[dependency];
/******/ 									if (acceptCallback) {
/******/ 										if (callbacks.indexOf(acceptCallback) !== -1) continue;
/******/ 										callbacks.push(acceptCallback);
/******/ 										errorHandlers.push(errorHandler);
/******/ 										dependenciesForCallbacks.push(dependency);
/******/ 									}
/******/ 								}
/******/ 								for (var k = 0; k < callbacks.length; k++) {
/******/ 									try {
/******/ 										callbacks[k].call(null, moduleOutdatedDependencies);
/******/ 									} catch (err) {
/******/ 										if (typeof errorHandlers[k] === "function") {
/******/ 											try {
/******/ 												errorHandlers[k](err, {
/******/ 													moduleId: outdatedModuleId,
/******/ 													dependencyId: dependenciesForCallbacks[k]
/******/ 												});
/******/ 											} catch (err2) {
/******/ 												if (options.onErrored) {
/******/ 													options.onErrored({
/******/ 														type: "accept-error-handler-errored",
/******/ 														moduleId: outdatedModuleId,
/******/ 														dependencyId: dependenciesForCallbacks[k],
/******/ 														error: err2,
/******/ 														originalError: err
/******/ 													});
/******/ 												}
/******/ 												if (!options.ignoreErrored) {
/******/ 													reportError(err2);
/******/ 													reportError(err);
/******/ 												}
/******/ 											}
/******/ 										} else {
/******/ 											if (options.onErrored) {
/******/ 												options.onErrored({
/******/ 													type: "accept-errored",
/******/ 													moduleId: outdatedModuleId,
/******/ 													dependencyId: dependenciesForCallbacks[k],
/******/ 													error: err
/******/ 												});
/******/ 											}
/******/ 											if (!options.ignoreErrored) {
/******/ 												reportError(err);
/******/ 											}
/******/ 										}
/******/ 									}
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					// Load self accepted modules
/******/ 					for (var o = 0; o < outdatedSelfAcceptedModules.length; o++) {
/******/ 						var item = outdatedSelfAcceptedModules[o];
/******/ 						var moduleId = item.module;
/******/ 						try {
/******/ 							item.require(moduleId);
/******/ 						} catch (err) {
/******/ 							if (typeof item.errorHandler === "function") {
/******/ 								try {
/******/ 									item.errorHandler(err, {
/******/ 										moduleId: moduleId,
/******/ 										module: __webpack_require__.c[moduleId]
/******/ 									});
/******/ 								} catch (err2) {
/******/ 									if (options.onErrored) {
/******/ 										options.onErrored({
/******/ 											type: "self-accept-error-handler-errored",
/******/ 											moduleId: moduleId,
/******/ 											error: err2,
/******/ 											originalError: err
/******/ 										});
/******/ 									}
/******/ 									if (!options.ignoreErrored) {
/******/ 										reportError(err2);
/******/ 										reportError(err);
/******/ 									}
/******/ 								}
/******/ 							} else {
/******/ 								if (options.onErrored) {
/******/ 									options.onErrored({
/******/ 										type: "self-accept-errored",
/******/ 										moduleId: moduleId,
/******/ 										error: err
/******/ 									});
/******/ 								}
/******/ 								if (!options.ignoreErrored) {
/******/ 									reportError(err);
/******/ 								}
/******/ 							}
/******/ 						}
/******/ 					}
/******/ 		
/******/ 					return outdatedModules;
/******/ 				}
/******/ 			};
/******/ 		}
/******/ 		__webpack_require__.hmrI.importScripts = function (moduleId, applyHandlers) {
/******/ 			if (!currentUpdate) {
/******/ 				currentUpdate = {};
/******/ 				currentUpdateRuntime = [];
/******/ 				currentUpdateRemovedChunks = [];
/******/ 				applyHandlers.push(applyHandler);
/******/ 			}
/******/ 			if (!__webpack_require__.o(currentUpdate, moduleId)) {
/******/ 				currentUpdate[moduleId] = __webpack_require__.m[moduleId];
/******/ 			}
/******/ 		};
/******/ 		__webpack_require__.hmrC.importScripts = function (
/******/ 			chunkIds,
/******/ 			removedChunks,
/******/ 			removedModules,
/******/ 			promises,
/******/ 			applyHandlers,
/******/ 			updatedModulesList
/******/ 		) {
/******/ 			applyHandlers.push(applyHandler);
/******/ 			currentUpdateChunks = {};
/******/ 			currentUpdateRemovedChunks = removedChunks;
/******/ 			currentUpdate = removedModules.reduce(function (obj, key) {
/******/ 				obj[key] = false;
/******/ 				return obj;
/******/ 			}, {});
/******/ 			currentUpdateRuntime = [];
/******/ 			chunkIds.forEach(function (chunkId) {
/******/ 				if (
/******/ 					__webpack_require__.o(installedChunks, chunkId) &&
/******/ 					installedChunks[chunkId] !== undefined
/******/ 				) {
/******/ 					promises.push(loadUpdateChunk(chunkId, updatedModulesList));
/******/ 					currentUpdateChunks[chunkId] = true;
/******/ 				} else {
/******/ 					currentUpdateChunks[chunkId] = false;
/******/ 				}
/******/ 			});
/******/ 			if (__webpack_require__.f) {
/******/ 				__webpack_require__.f.importScriptsHmr = function (chunkId, promises) {
/******/ 					if (
/******/ 						currentUpdateChunks &&
/******/ 						__webpack_require__.o(currentUpdateChunks, chunkId) &&
/******/ 						!currentUpdateChunks[chunkId]
/******/ 					) {
/******/ 						promises.push(loadUpdateChunk(chunkId));
/******/ 						currentUpdateChunks[chunkId] = true;
/******/ 					}
/******/ 				};
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		__webpack_require__.hmrM = function() {
/******/ 			if (typeof fetch === "undefined") throw new Error("No browser support: need fetch API");
/******/ 			return fetch(__webpack_require__.p + __webpack_require__.hmrF()).then(function(response) {
/******/ 				if(response.status === 404) return; // no update available
/******/ 				if(!response.ok) throw new Error("Failed to fetch update manifest " + response.statusText);
/******/ 				return response.json();
/******/ 			});
/******/ 		};
/******/ 	}();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// module cache are used so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	var __webpack_exports__ = __webpack_require__("(app-pages-browser)/./src/workers/analysis.worker.ts");
/******/ 	_N_E = __webpack_exports__;
/******/ 	
/******/ })()
;