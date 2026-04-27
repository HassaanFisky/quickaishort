/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "@xenova/transformers":
/*!***************************************!*\
  !*** external "@xenova/transformers" ***!
  \***************************************/
/***/ ((module) => {

module.exports = import("@xenova/transformers");;

/***/ }),

/***/ "(ssr)/./src/workers/whisper.worker.ts":
/*!***************************************!*\
  !*** ./src/workers/whisper.worker.ts ***!
  \***************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {\n__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _xenova_transformers__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @xenova/transformers */ \"@xenova/transformers\");\nvar __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_xenova_transformers__WEBPACK_IMPORTED_MODULE_0__]);\n_xenova_transformers__WEBPACK_IMPORTED_MODULE_0__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];\n\n// Use any for pipeline as the types are complex and not fully exported\n// eslint-disable-next-line @typescript-eslint/no-explicit-any\nlet transcriber = null;\nasync function loadWhisper(model = \"Xenova/whisper-tiny.en\") {\n    if (transcriber) return transcriber;\n    self.postMessage({\n        type: \"status\",\n        stage: \"download\",\n        payload: {\n            message: `Loading ${model}...`\n        }\n    });\n    transcriber = await (0,_xenova_transformers__WEBPACK_IMPORTED_MODULE_0__.pipeline)(\"automatic-speech-recognition\", model, {\n        progress_callback: (progress)=>{\n            if (progress.status === \"progress\") {\n                self.postMessage({\n                    type: \"progress\",\n                    stage: \"download\",\n                    payload: {\n                        progress: Math.round(progress.progress),\n                        bytesLoaded: progress.loaded,\n                        bytesTotal: progress.total\n                    }\n                });\n            }\n        }\n    });\n    return transcriber;\n}\nasync function transcribe(audioData) {\n    const whisper = await loadWhisper();\n    self.postMessage({\n        type: \"status\",\n        stage: \"process\",\n        payload: {\n            message: \"Transcribing...\"\n        }\n    });\n    const result = await whisper(audioData, {\n        chunk_length_s: 30,\n        stride_length_s: 5,\n        return_timestamps: true,\n        task: \"transcribe\"\n    });\n    return result;\n}\nself.onmessage = async (e)=>{\n    try {\n        const { type, payload } = e.data;\n        switch(type){\n            case \"load\":\n                await loadWhisper(payload?.model);\n                self.postMessage({\n                    type: \"complete\",\n                    stage: \"load\",\n                    payload: {\n                        message: \"Whisper loaded\"\n                    }\n                });\n                break;\n            case \"transcribe\":\n                const result = await transcribe(payload.audioData);\n                self.postMessage({\n                    type: \"complete\",\n                    stage: \"process\",\n                    payload: {\n                        transcript: result\n                    }\n                });\n                break;\n        }\n    } catch (error) {\n        self.postMessage({\n            type: \"error\",\n            stage: \"process\",\n            payload: {\n                message: error instanceof Error ? error.message : \"Unknown error\"\n            }\n        });\n    }\n};\n\n__webpack_async_result__();\n} catch(e) { __webpack_async_result__(e); } });//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9zcmMvd29ya2Vycy93aGlzcGVyLndvcmtlci50cyIsIm1hcHBpbmdzIjoiOzs7OztBQUFnRDtBQUVoRCx1RUFBdUU7QUFDdkUsOERBQThEO0FBQzlELElBQUlDLGNBQW1CO0FBRXZCLGVBQWVDLFlBQVlDLFFBQWdCLHdCQUF3QjtJQUNqRSxJQUFJRixhQUFhLE9BQU9BO0lBRXhCRyxLQUFLQyxXQUFXLENBQUM7UUFDZkMsTUFBTTtRQUNOQyxPQUFPO1FBQ1BDLFNBQVM7WUFBRUMsU0FBUyxDQUFDLFFBQVEsRUFBRU4sTUFBTSxHQUFHLENBQUM7UUFBQztJQUM1QztJQUVBRixjQUFjLE1BQU1ELDhEQUFRQSxDQUFDLGdDQUFnQ0csT0FBTztRQUNsRU8sbUJBQW1CLENBQUNDO1lBTWxCLElBQUlBLFNBQVNDLE1BQU0sS0FBSyxZQUFZO2dCQUNsQ1IsS0FBS0MsV0FBVyxDQUFDO29CQUNmQyxNQUFNO29CQUNOQyxPQUFPO29CQUNQQyxTQUFTO3dCQUNQRyxVQUFVRSxLQUFLQyxLQUFLLENBQUNILFNBQVNBLFFBQVE7d0JBQ3RDSSxhQUFhSixTQUFTSyxNQUFNO3dCQUM1QkMsWUFBWU4sU0FBU08sS0FBSztvQkFDNUI7Z0JBQ0Y7WUFDRjtRQUNGO0lBQ0Y7SUFFQSxPQUFPakI7QUFDVDtBQUVBLGVBQWVrQixXQUFXQyxTQUF1QjtJQUMvQyxNQUFNQyxVQUFVLE1BQU1uQjtJQUV0QkUsS0FBS0MsV0FBVyxDQUFDO1FBQ2ZDLE1BQU07UUFDTkMsT0FBTztRQUNQQyxTQUFTO1lBQUVDLFNBQVM7UUFBa0I7SUFDeEM7SUFFQSxNQUFNYSxTQUFTLE1BQU1ELFFBQVFELFdBQVc7UUFDdENHLGdCQUFnQjtRQUNoQkMsaUJBQWlCO1FBQ2pCQyxtQkFBbUI7UUFDbkJDLE1BQU07SUFDUjtJQUVBLE9BQU9KO0FBQ1Q7QUFFQWxCLEtBQUt1QixTQUFTLEdBQUcsT0FBT0M7SUFDdEIsSUFBSTtRQUNGLE1BQU0sRUFBRXRCLElBQUksRUFBRUUsT0FBTyxFQUFFLEdBQUdvQixFQUFFQyxJQUFJO1FBRWhDLE9BQVF2QjtZQUNOLEtBQUs7Z0JBQ0gsTUFBTUosWUFBWU0sU0FBU0w7Z0JBQzNCQyxLQUFLQyxXQUFXLENBQUM7b0JBQ2ZDLE1BQU07b0JBQ05DLE9BQU87b0JBQ1BDLFNBQVM7d0JBQUVDLFNBQVM7b0JBQWlCO2dCQUN2QztnQkFDQTtZQUVGLEtBQUs7Z0JBQ0gsTUFBTWEsU0FBUyxNQUFNSCxXQUFXWCxRQUFRWSxTQUFTO2dCQUNqRGhCLEtBQUtDLFdBQVcsQ0FBQztvQkFDZkMsTUFBTTtvQkFDTkMsT0FBTztvQkFDUEMsU0FBUzt3QkFBRXNCLFlBQVlSO29CQUFPO2dCQUNoQztnQkFDQTtRQUNKO0lBQ0YsRUFBRSxPQUFPUyxPQUFPO1FBQ2QzQixLQUFLQyxXQUFXLENBQUM7WUFDZkMsTUFBTTtZQUNOQyxPQUFPO1lBQ1BDLFNBQVM7Z0JBQ1BDLFNBQVNzQixpQkFBaUJDLFFBQVFELE1BQU10QixPQUFPLEdBQUc7WUFDcEQ7UUFDRjtJQUNGO0FBQ0YiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9xdWlja2FpLXNob3J0cy8uL3NyYy93b3JrZXJzL3doaXNwZXIud29ya2VyLnRzP2EyZDciXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcGlwZWxpbmUgfSBmcm9tIFwiQHhlbm92YS90cmFuc2Zvcm1lcnNcIjtcclxuXHJcbi8vIFVzZSBhbnkgZm9yIHBpcGVsaW5lIGFzIHRoZSB0eXBlcyBhcmUgY29tcGxleCBhbmQgbm90IGZ1bGx5IGV4cG9ydGVkXHJcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XHJcbmxldCB0cmFuc2NyaWJlcjogYW55ID0gbnVsbDtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRXaGlzcGVyKG1vZGVsOiBzdHJpbmcgPSBcIlhlbm92YS93aGlzcGVyLXRpbnkuZW5cIikge1xyXG4gIGlmICh0cmFuc2NyaWJlcikgcmV0dXJuIHRyYW5zY3JpYmVyO1xyXG5cclxuICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgIHR5cGU6IFwic3RhdHVzXCIsXHJcbiAgICBzdGFnZTogXCJkb3dubG9hZFwiLFxyXG4gICAgcGF5bG9hZDogeyBtZXNzYWdlOiBgTG9hZGluZyAke21vZGVsfS4uLmAgfSxcclxuICB9KTtcclxuXHJcbiAgdHJhbnNjcmliZXIgPSBhd2FpdCBwaXBlbGluZShcImF1dG9tYXRpYy1zcGVlY2gtcmVjb2duaXRpb25cIiwgbW9kZWwsIHtcclxuICAgIHByb2dyZXNzX2NhbGxiYWNrOiAocHJvZ3Jlc3M6IHtcclxuICAgICAgc3RhdHVzOiBzdHJpbmc7XHJcbiAgICAgIHByb2dyZXNzOiBudW1iZXI7XHJcbiAgICAgIGxvYWRlZDogbnVtYmVyO1xyXG4gICAgICB0b3RhbDogbnVtYmVyO1xyXG4gICAgfSkgPT4ge1xyXG4gICAgICBpZiAocHJvZ3Jlc3Muc3RhdHVzID09PSBcInByb2dyZXNzXCIpIHtcclxuICAgICAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgICAgIHR5cGU6IFwicHJvZ3Jlc3NcIixcclxuICAgICAgICAgIHN0YWdlOiBcImRvd25sb2FkXCIsXHJcbiAgICAgICAgICBwYXlsb2FkOiB7XHJcbiAgICAgICAgICAgIHByb2dyZXNzOiBNYXRoLnJvdW5kKHByb2dyZXNzLnByb2dyZXNzKSxcclxuICAgICAgICAgICAgYnl0ZXNMb2FkZWQ6IHByb2dyZXNzLmxvYWRlZCxcclxuICAgICAgICAgICAgYnl0ZXNUb3RhbDogcHJvZ3Jlc3MudG90YWwsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gdHJhbnNjcmliZXI7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHRyYW5zY3JpYmUoYXVkaW9EYXRhOiBGbG9hdDMyQXJyYXkpIHtcclxuICBjb25zdCB3aGlzcGVyID0gYXdhaXQgbG9hZFdoaXNwZXIoKTtcclxuXHJcbiAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICB0eXBlOiBcInN0YXR1c1wiLFxyXG4gICAgc3RhZ2U6IFwicHJvY2Vzc1wiLFxyXG4gICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIlRyYW5zY3JpYmluZy4uLlwiIH0sXHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdoaXNwZXIoYXVkaW9EYXRhLCB7XHJcbiAgICBjaHVua19sZW5ndGhfczogMzAsXHJcbiAgICBzdHJpZGVfbGVuZ3RoX3M6IDUsXHJcbiAgICByZXR1cm5fdGltZXN0YW1wczogdHJ1ZSxcclxuICAgIHRhc2s6IFwidHJhbnNjcmliZVwiLFxyXG4gIH0pO1xyXG5cclxuICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5zZWxmLm9ubWVzc2FnZSA9IGFzeW5jIChlOiBNZXNzYWdlRXZlbnQpID0+IHtcclxuICB0cnkge1xyXG4gICAgY29uc3QgeyB0eXBlLCBwYXlsb2FkIH0gPSBlLmRhdGE7XHJcblxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgXCJsb2FkXCI6XHJcbiAgICAgICAgYXdhaXQgbG9hZFdoaXNwZXIocGF5bG9hZD8ubW9kZWwpO1xyXG4gICAgICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgdHlwZTogXCJjb21wbGV0ZVwiLFxyXG4gICAgICAgICAgc3RhZ2U6IFwibG9hZFwiLFxyXG4gICAgICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIldoaXNwZXIgbG9hZGVkXCIgfSxcclxuICAgICAgICB9KTtcclxuICAgICAgICBicmVhaztcclxuXHJcbiAgICAgIGNhc2UgXCJ0cmFuc2NyaWJlXCI6XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdHJhbnNjcmliZShwYXlsb2FkLmF1ZGlvRGF0YSk7XHJcbiAgICAgICAgc2VsZi5wb3N0TWVzc2FnZSh7XHJcbiAgICAgICAgICB0eXBlOiBcImNvbXBsZXRlXCIsXHJcbiAgICAgICAgICBzdGFnZTogXCJwcm9jZXNzXCIsXHJcbiAgICAgICAgICBwYXlsb2FkOiB7IHRyYW5zY3JpcHQ6IHJlc3VsdCB9LFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICBzZWxmLnBvc3RNZXNzYWdlKHtcclxuICAgICAgdHlwZTogXCJlcnJvclwiLFxyXG4gICAgICBzdGFnZTogXCJwcm9jZXNzXCIsXHJcbiAgICAgIHBheWxvYWQ6IHtcclxuICAgICAgICBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFwiVW5rbm93biBlcnJvclwiLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgfVxyXG59O1xyXG4iXSwibmFtZXMiOlsicGlwZWxpbmUiLCJ0cmFuc2NyaWJlciIsImxvYWRXaGlzcGVyIiwibW9kZWwiLCJzZWxmIiwicG9zdE1lc3NhZ2UiLCJ0eXBlIiwic3RhZ2UiLCJwYXlsb2FkIiwibWVzc2FnZSIsInByb2dyZXNzX2NhbGxiYWNrIiwicHJvZ3Jlc3MiLCJzdGF0dXMiLCJNYXRoIiwicm91bmQiLCJieXRlc0xvYWRlZCIsImxvYWRlZCIsImJ5dGVzVG90YWwiLCJ0b3RhbCIsInRyYW5zY3JpYmUiLCJhdWRpb0RhdGEiLCJ3aGlzcGVyIiwicmVzdWx0IiwiY2h1bmtfbGVuZ3RoX3MiLCJzdHJpZGVfbGVuZ3RoX3MiLCJyZXR1cm5fdGltZXN0YW1wcyIsInRhc2siLCJvbm1lc3NhZ2UiLCJlIiwiZGF0YSIsInRyYW5zY3JpcHQiLCJlcnJvciIsIkVycm9yIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/./src/workers/whisper.worker.ts\n");

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
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/async module */
/******/ 	(() => {
/******/ 		var webpackQueues = typeof Symbol === "function" ? Symbol("webpack queues") : "__webpack_queues__";
/******/ 		var webpackExports = typeof Symbol === "function" ? Symbol("webpack exports") : "__webpack_exports__";
/******/ 		var webpackError = typeof Symbol === "function" ? Symbol("webpack error") : "__webpack_error__";
/******/ 		var resolveQueue = (queue) => {
/******/ 			if(queue && queue.d < 1) {
/******/ 				queue.d = 1;
/******/ 				queue.forEach((fn) => (fn.r--));
/******/ 				queue.forEach((fn) => (fn.r-- ? fn.r++ : fn()));
/******/ 			}
/******/ 		}
/******/ 		var wrapDeps = (deps) => (deps.map((dep) => {
/******/ 			if(dep !== null && typeof dep === "object") {
/******/ 				if(dep[webpackQueues]) return dep;
/******/ 				if(dep.then) {
/******/ 					var queue = [];
/******/ 					queue.d = 0;
/******/ 					dep.then((r) => {
/******/ 						obj[webpackExports] = r;
/******/ 						resolveQueue(queue);
/******/ 					}, (e) => {
/******/ 						obj[webpackError] = e;
/******/ 						resolveQueue(queue);
/******/ 					});
/******/ 					var obj = {};
/******/ 					obj[webpackQueues] = (fn) => (fn(queue));
/******/ 					return obj;
/******/ 				}
/******/ 			}
/******/ 			var ret = {};
/******/ 			ret[webpackQueues] = x => {};
/******/ 			ret[webpackExports] = dep;
/******/ 			return ret;
/******/ 		}));
/******/ 		__webpack_require__.a = (module, body, hasAwait) => {
/******/ 			var queue;
/******/ 			hasAwait && ((queue = []).d = -1);
/******/ 			var depQueues = new Set();
/******/ 			var exports = module.exports;
/******/ 			var currentDeps;
/******/ 			var outerResolve;
/******/ 			var reject;
/******/ 			var promise = new Promise((resolve, rej) => {
/******/ 				reject = rej;
/******/ 				outerResolve = resolve;
/******/ 			});
/******/ 			promise[webpackExports] = exports;
/******/ 			promise[webpackQueues] = (fn) => (queue && fn(queue), depQueues.forEach(fn), promise["catch"](x => {}));
/******/ 			module.exports = promise;
/******/ 			body((deps) => {
/******/ 				currentDeps = wrapDeps(deps);
/******/ 				var fn;
/******/ 				var getResult = () => (currentDeps.map((d) => {
/******/ 					if(d[webpackError]) throw d[webpackError];
/******/ 					return d[webpackExports];
/******/ 				}))
/******/ 				var promise = new Promise((resolve) => {
/******/ 					fn = () => (resolve(getResult));
/******/ 					fn.r = 0;
/******/ 					var fnQueue = (q) => (q !== queue && !depQueues.has(q) && (depQueues.add(q), q && !q.d && (fn.r++, q.push(fn))));
/******/ 					currentDeps.map((dep) => (dep[webpackQueues](fnQueue)));
/******/ 				});
/******/ 				return fn.r ? promise : getResult();
/******/ 			}, (err) => ((err ? reject(promise[webpackError] = err) : outerResolve(exports)), resolveQueue(queue)));
/******/ 			queue && queue.d < 0 && (queue.d = 0);
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval-source-map devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("(ssr)/./src/workers/whisper.worker.ts");
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;