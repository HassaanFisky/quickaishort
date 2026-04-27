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

/***/ "(ssr)/./src/workers/face.worker.ts":
/*!************************************!*\
  !*** ./src/workers/face.worker.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _mediapipe_tasks_vision__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @mediapipe/tasks-vision */ \"(ssr)/./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs\");\n/* eslint-disable @typescript-eslint/no-explicit-any */ \nconst ctx = self;\nlet faceDetector = null;\nlet isBusy = false;\n// Initialize MediaPipe Face Detector\nconst initializeFaceDetector = async ()=>{\n    try {\n        postMessage({\n            type: \"status\",\n            stage: \"init\",\n            payload: {\n                message: \"Loading Face Detection Model...\"\n            },\n            timestamp: Date.now()\n        });\n        const vision = await _mediapipe_tasks_vision__WEBPACK_IMPORTED_MODULE_0__.FilesetResolver.forVisionTasks(\"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm\");\n        faceDetector = await _mediapipe_tasks_vision__WEBPACK_IMPORTED_MODULE_0__.FaceDetector.createFromOptions(vision, {\n            baseOptions: {\n                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,\n                delegate: \"GPU\"\n            },\n            runningMode: \"VIDEO\"\n        });\n        postMessage({\n            type: \"status\",\n            stage: \"ready\",\n            payload: {\n                message: \"Face Detector Ready\"\n            },\n            timestamp: Date.now()\n        });\n    } catch (error) {\n        postMessage({\n            type: \"error\",\n            stage: \"init\",\n            payload: {\n                message: \"Failed to load Face Detector\",\n                error\n            },\n            timestamp: Date.now()\n        });\n    }\n};\nctx.addEventListener(\"message\", async (event)=>{\n    if (event.data.type === \"init\") {\n        await initializeFaceDetector();\n        return;\n    }\n    if (event.data.type === \"detect\" && faceDetector) {\n        if (isBusy) return; // Drop frame if busy\n        isBusy = true;\n        try {\n            const { frame, timestamp } = event.data.payload;\n            const result = faceDetector.detectForVideo(frame, timestamp);\n            if (result.detections.length > 0) {\n                // Get the most confident face\n                const bestFace = result.detections[0];\n                const box = bestFace.boundingBox;\n                postMessage({\n                    type: \"face_detected\",\n                    stage: \"detect\",\n                    payload: {\n                        face: {\n                            box: {\n                                x: box?.originX ?? 0,\n                                y: box?.originY ?? 0,\n                                width: box?.width ?? 0,\n                                height: box?.height ?? 0\n                            },\n                            confidence: bestFace.categories[0].score\n                        }\n                    },\n                    timestamp: Date.now()\n                });\n            }\n        } catch (e) {\n            console.error(\"Face Detection Error:\", e);\n        } finally{\n            isBusy = false;\n        }\n    }\n});\nfunction postMessage(msg) {\n    ctx.postMessage(msg);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9zcmMvd29ya2Vycy9mYWNlLndvcmtlci50cyIsIm1hcHBpbmdzIjoiOztBQUFBLHFEQUFxRCxHQUtwQjtBQUdqQyxNQUFNRSxNQUFjQztBQUVwQixJQUFJQyxlQUFvQztBQUN4QyxJQUFJQyxTQUFTO0FBRWIscUNBQXFDO0FBQ3JDLE1BQU1DLHlCQUF5QjtJQUM3QixJQUFJO1FBQ0ZDLFlBQVk7WUFDVkMsTUFBTTtZQUNOQyxPQUFPO1lBQ1BDLFNBQVM7Z0JBQUVDLFNBQVM7WUFBa0M7WUFDdERDLFdBQVdDLEtBQUtDLEdBQUc7UUFDckI7UUFFQSxNQUFNQyxTQUFTLE1BQU1mLG9FQUFlQSxDQUFDZ0IsY0FBYyxDQUNqRDtRQUdGWixlQUFlLE1BQU1ILGlFQUFZQSxDQUFDZ0IsaUJBQWlCLENBQUNGLFFBQVE7WUFDMURHLGFBQWE7Z0JBQ1hDLGdCQUFnQixDQUFDLDRIQUE0SCxDQUFDO2dCQUM5SUMsVUFBVTtZQUNaO1lBQ0FDLGFBQWE7UUFDZjtRQUVBZCxZQUFZO1lBQ1ZDLE1BQU07WUFDTkMsT0FBTztZQUNQQyxTQUFTO2dCQUFFQyxTQUFTO1lBQXNCO1lBQzFDQyxXQUFXQyxLQUFLQyxHQUFHO1FBQ3JCO0lBQ0YsRUFBRSxPQUFPUSxPQUFPO1FBQ2RmLFlBQVk7WUFDVkMsTUFBTTtZQUNOQyxPQUFPO1lBQ1BDLFNBQVM7Z0JBQUVDLFNBQVM7Z0JBQWdDVztZQUFNO1lBQzFEVixXQUFXQyxLQUFLQyxHQUFHO1FBQ3JCO0lBQ0Y7QUFDRjtBQUVBWixJQUFJcUIsZ0JBQWdCLENBQUMsV0FBVyxPQUFPQztJQUNyQyxJQUFJQSxNQUFNQyxJQUFJLENBQUNqQixJQUFJLEtBQUssUUFBUTtRQUM5QixNQUFNRjtRQUNOO0lBQ0Y7SUFFQSxJQUFJa0IsTUFBTUMsSUFBSSxDQUFDakIsSUFBSSxLQUFLLFlBQVlKLGNBQWM7UUFDaEQsSUFBSUMsUUFBUSxRQUFRLHFCQUFxQjtRQUN6Q0EsU0FBUztRQUVULElBQUk7WUFDRixNQUFNLEVBQUVxQixLQUFLLEVBQUVkLFNBQVMsRUFBRSxHQUFHWSxNQUFNQyxJQUFJLENBQUNmLE9BQU87WUFDL0MsTUFBTWlCLFNBQTZCdkIsYUFBYXdCLGNBQWMsQ0FDNURGLE9BQ0FkO1lBR0YsSUFBSWUsT0FBT0UsVUFBVSxDQUFDQyxNQUFNLEdBQUcsR0FBRztnQkFDaEMsOEJBQThCO2dCQUM5QixNQUFNQyxXQUFXSixPQUFPRSxVQUFVLENBQUMsRUFBRTtnQkFDckMsTUFBTUcsTUFBTUQsU0FBU0UsV0FBVztnQkFFaEMxQixZQUFZO29CQUNWQyxNQUFNO29CQUNOQyxPQUFPO29CQUNQQyxTQUFTO3dCQUNQd0IsTUFBTTs0QkFDSkYsS0FBSztnQ0FDSEcsR0FBR0gsS0FBS0ksV0FBVztnQ0FDbkJDLEdBQUdMLEtBQUtNLFdBQVc7Z0NBQ25CQyxPQUFPUCxLQUFLTyxTQUFTO2dDQUNyQkMsUUFBUVIsS0FBS1EsVUFBVTs0QkFDekI7NEJBQ0FDLFlBQVlWLFNBQVNXLFVBQVUsQ0FBQyxFQUFFLENBQUNDLEtBQUs7d0JBQzFDO29CQUNGO29CQUNBL0IsV0FBV0MsS0FBS0MsR0FBRztnQkFDckI7WUFDRjtRQUNGLEVBQUUsT0FBTzhCLEdBQUc7WUFDVkMsUUFBUXZCLEtBQUssQ0FBQyx5QkFBeUJzQjtRQUN6QyxTQUFVO1lBQ1J2QyxTQUFTO1FBQ1g7SUFDRjtBQUNGO0FBRUEsU0FBU0UsWUFBWXVDLEdBQWtCO0lBQ3JDNUMsSUFBSUssV0FBVyxDQUFDdUM7QUFDbEIiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9xdWlja2FpLXNob3J0cy8uL3NyYy93b3JrZXJzL2ZhY2Uud29ya2VyLnRzPzJhYmYiXSwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAqL1xyXG5pbXBvcnQge1xyXG4gIEZpbGVzZXRSZXNvbHZlcixcclxuICBGYWNlRGV0ZWN0b3IsXHJcbiAgRmFjZURldGVjdG9yUmVzdWx0LFxyXG59IGZyb20gXCJAbWVkaWFwaXBlL3Rhc2tzLXZpc2lvblwiO1xyXG5pbXBvcnQgeyBXb3JrZXJNZXNzYWdlIH0gZnJvbSBcIkAvdHlwZXMvcGlwZWxpbmVcIjtcclxuXHJcbmNvbnN0IGN0eDogV29ya2VyID0gc2VsZiBhcyBhbnk7XHJcblxyXG5sZXQgZmFjZURldGVjdG9yOiBGYWNlRGV0ZWN0b3IgfCBudWxsID0gbnVsbDtcclxubGV0IGlzQnVzeSA9IGZhbHNlO1xyXG5cclxuLy8gSW5pdGlhbGl6ZSBNZWRpYVBpcGUgRmFjZSBEZXRlY3RvclxyXG5jb25zdCBpbml0aWFsaXplRmFjZURldGVjdG9yID0gYXN5bmMgKCkgPT4ge1xyXG4gIHRyeSB7XHJcbiAgICBwb3N0TWVzc2FnZSh7XHJcbiAgICAgIHR5cGU6IFwic3RhdHVzXCIsXHJcbiAgICAgIHN0YWdlOiBcImluaXRcIixcclxuICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIkxvYWRpbmcgRmFjZSBEZXRlY3Rpb24gTW9kZWwuLi5cIiB9LFxyXG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCB2aXNpb24gPSBhd2FpdCBGaWxlc2V0UmVzb2x2ZXIuZm9yVmlzaW9uVGFza3MoXHJcbiAgICAgIFwiaHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L25wbS9AbWVkaWFwaXBlL3Rhc2tzLXZpc2lvbkAwLjEwLjAvd2FzbVwiLFxyXG4gICAgKTtcclxuXHJcbiAgICBmYWNlRGV0ZWN0b3IgPSBhd2FpdCBGYWNlRGV0ZWN0b3IuY3JlYXRlRnJvbU9wdGlvbnModmlzaW9uLCB7XHJcbiAgICAgIGJhc2VPcHRpb25zOiB7XHJcbiAgICAgICAgbW9kZWxBc3NldFBhdGg6IGBodHRwczovL3N0b3JhZ2UuZ29vZ2xlYXBpcy5jb20vbWVkaWFwaXBlLW1vZGVscy9mYWNlX2RldGVjdG9yL2JsYXplX2ZhY2Vfc2hvcnRfcmFuZ2UvZmxvYXQxNi8xL2JsYXplX2ZhY2Vfc2hvcnRfcmFuZ2UudGZsaXRlYCxcclxuICAgICAgICBkZWxlZ2F0ZTogXCJHUFVcIixcclxuICAgICAgfSxcclxuICAgICAgcnVubmluZ01vZGU6IFwiVklERU9cIixcclxuICAgIH0pO1xyXG5cclxuICAgIHBvc3RNZXNzYWdlKHtcclxuICAgICAgdHlwZTogXCJzdGF0dXNcIixcclxuICAgICAgc3RhZ2U6IFwicmVhZHlcIixcclxuICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIkZhY2UgRGV0ZWN0b3IgUmVhZHlcIiB9LFxyXG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXHJcbiAgICB9KTtcclxuICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgcG9zdE1lc3NhZ2Uoe1xyXG4gICAgICB0eXBlOiBcImVycm9yXCIsXHJcbiAgICAgIHN0YWdlOiBcImluaXRcIixcclxuICAgICAgcGF5bG9hZDogeyBtZXNzYWdlOiBcIkZhaWxlZCB0byBsb2FkIEZhY2UgRGV0ZWN0b3JcIiwgZXJyb3IgfSxcclxuICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59O1xyXG5cclxuY3R4LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIGFzeW5jIChldmVudCkgPT4ge1xyXG4gIGlmIChldmVudC5kYXRhLnR5cGUgPT09IFwiaW5pdFwiKSB7XHJcbiAgICBhd2FpdCBpbml0aWFsaXplRmFjZURldGVjdG9yKCk7XHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBpZiAoZXZlbnQuZGF0YS50eXBlID09PSBcImRldGVjdFwiICYmIGZhY2VEZXRlY3Rvcikge1xyXG4gICAgaWYgKGlzQnVzeSkgcmV0dXJuOyAvLyBEcm9wIGZyYW1lIGlmIGJ1c3lcclxuICAgIGlzQnVzeSA9IHRydWU7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgeyBmcmFtZSwgdGltZXN0YW1wIH0gPSBldmVudC5kYXRhLnBheWxvYWQ7XHJcbiAgICAgIGNvbnN0IHJlc3VsdDogRmFjZURldGVjdG9yUmVzdWx0ID0gZmFjZURldGVjdG9yLmRldGVjdEZvclZpZGVvKFxyXG4gICAgICAgIGZyYW1lLFxyXG4gICAgICAgIHRpbWVzdGFtcCxcclxuICAgICAgKTtcclxuXHJcbiAgICAgIGlmIChyZXN1bHQuZGV0ZWN0aW9ucy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgLy8gR2V0IHRoZSBtb3N0IGNvbmZpZGVudCBmYWNlXHJcbiAgICAgICAgY29uc3QgYmVzdEZhY2UgPSByZXN1bHQuZGV0ZWN0aW9uc1swXTtcclxuICAgICAgICBjb25zdCBib3ggPSBiZXN0RmFjZS5ib3VuZGluZ0JveDtcclxuXHJcbiAgICAgICAgcG9zdE1lc3NhZ2Uoe1xyXG4gICAgICAgICAgdHlwZTogXCJmYWNlX2RldGVjdGVkXCIsXHJcbiAgICAgICAgICBzdGFnZTogXCJkZXRlY3RcIixcclxuICAgICAgICAgIHBheWxvYWQ6IHtcclxuICAgICAgICAgICAgZmFjZToge1xyXG4gICAgICAgICAgICAgIGJveDoge1xyXG4gICAgICAgICAgICAgICAgeDogYm94Py5vcmlnaW5YID8/IDAsXHJcbiAgICAgICAgICAgICAgICB5OiBib3g/Lm9yaWdpblkgPz8gMCxcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBib3g/LndpZHRoID8/IDAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGJveD8uaGVpZ2h0ID8/IDAsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBjb25maWRlbmNlOiBiZXN0RmFjZS5jYXRlZ29yaWVzWzBdLnNjb3JlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRmFjZSBEZXRlY3Rpb24gRXJyb3I6XCIsIGUpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgaXNCdXN5ID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG59KTtcclxuXHJcbmZ1bmN0aW9uIHBvc3RNZXNzYWdlKG1zZzogV29ya2VyTWVzc2FnZSkge1xyXG4gIGN0eC5wb3N0TWVzc2FnZShtc2cpO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJGaWxlc2V0UmVzb2x2ZXIiLCJGYWNlRGV0ZWN0b3IiLCJjdHgiLCJzZWxmIiwiZmFjZURldGVjdG9yIiwiaXNCdXN5IiwiaW5pdGlhbGl6ZUZhY2VEZXRlY3RvciIsInBvc3RNZXNzYWdlIiwidHlwZSIsInN0YWdlIiwicGF5bG9hZCIsIm1lc3NhZ2UiLCJ0aW1lc3RhbXAiLCJEYXRlIiwibm93IiwidmlzaW9uIiwiZm9yVmlzaW9uVGFza3MiLCJjcmVhdGVGcm9tT3B0aW9ucyIsImJhc2VPcHRpb25zIiwibW9kZWxBc3NldFBhdGgiLCJkZWxlZ2F0ZSIsInJ1bm5pbmdNb2RlIiwiZXJyb3IiLCJhZGRFdmVudExpc3RlbmVyIiwiZXZlbnQiLCJkYXRhIiwiZnJhbWUiLCJyZXN1bHQiLCJkZXRlY3RGb3JWaWRlbyIsImRldGVjdGlvbnMiLCJsZW5ndGgiLCJiZXN0RmFjZSIsImJveCIsImJvdW5kaW5nQm94IiwiZmFjZSIsIngiLCJvcmlnaW5YIiwieSIsIm9yaWdpblkiLCJ3aWR0aCIsImhlaWdodCIsImNvbmZpZGVuY2UiLCJjYXRlZ29yaWVzIiwic2NvcmUiLCJlIiwiY29uc29sZSIsIm1zZyJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/./src/workers/face.worker.ts\n");

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
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/******/ 	// the startup function
/******/ 	__webpack_require__.x = () => {
/******/ 		// Load entry module and return exports
/******/ 		// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 		var __webpack_exports__ = __webpack_require__.O(undefined, ["vendor-chunks/@mediapipe"], () => (__webpack_require__("(ssr)/./src/workers/face.worker.ts")))
/******/ 		__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/ 		return __webpack_exports__;
/******/ 	};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks and sibling chunks for the entrypoint
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
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
/******/ 	/* webpack/runtime/require chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "loaded", otherwise not loaded yet
/******/ 		var installedChunks = {
/******/ 			"_ssr_src_workers_face_worker_ts": 1
/******/ 		};
/******/ 		
/******/ 		__webpack_require__.O.require = (chunkId) => (installedChunks[chunkId]);
/******/ 		
/******/ 		var installChunk = (chunk) => {
/******/ 			var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			for(var i = 0; i < chunkIds.length; i++)
/******/ 				installedChunks[chunkIds[i]] = 1;
/******/ 			__webpack_require__.O();
/******/ 		};
/******/ 		
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					installChunk(require("./" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		// no external install chunk
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/startup chunk dependencies */
/******/ 	(() => {
/******/ 		var next = __webpack_require__.x;
/******/ 		__webpack_require__.x = () => {
/******/ 			__webpack_require__.e("vendor-chunks/@mediapipe");
/******/ 			return next();
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// run startup
/******/ 	var __webpack_exports__ = __webpack_require__.x();
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;