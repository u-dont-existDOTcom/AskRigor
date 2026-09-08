// Fixed synthetic-only read projection. Private account documents are never read.
export function syntheticIdentityAndGeometry(context) {
  const result = {
    phase: context.phase,
    dataUrlSha256: null,
    documentElementOuterHtmlSha256: null,
    dataUrlMatchedBeforeOuterHtmlRead: false,
    geometry: {
      innerWidth: null, innerHeight: null, devicePixelRatio: null,
      scrollX: null, scrollY: null,
      visualViewport: { width: null, height: null, offsetLeft: null, offsetTop: null, scale: null },
    },
    unavailable: [],
    ready: false,
  };
  try {
    if (location.href !== context.page.dataUrl) {
      result.unavailable.push("EXACT_SYNTHETIC_DATA_URL_NOT_ESTABLISHED");
      return result;
    }
    result.dataUrlMatchedBeforeOuterHtmlRead = true;
    result.dataUrlSha256 = context.page.dataUrlSha256;
    if (document.documentElement.outerHTML !== context.page.expectedDocumentElementOuterHtml) {
      result.unavailable.push("EXACT_SYNTHETIC_DOCUMENT_NOT_ESTABLISHED");
      return result;
    }
    result.documentElementOuterHtmlSha256 = context.page.documentElementOuterHtmlSha256;
  } catch {
    result.unavailable.push("SYNTHETIC_IDENTITY_READ_UNAVAILABLE");
    return result;
  }
  for (const field of ["innerWidth", "innerHeight", "devicePixelRatio", "scrollX", "scrollY"]) {
    try {
      const value = window[field];
      if (typeof value === "number" && Number.isFinite(value)) result.geometry[field] = value;
      else result.unavailable.push(`GEOMETRY_UNAVAILABLE:${field}`);
    } catch { result.unavailable.push(`GEOMETRY_UNAVAILABLE:${field}`); }
  }
  for (const field of ["width", "height", "offsetLeft", "offsetTop", "scale"]) {
    try {
      const value = window.visualViewport[field];
      if (typeof value === "number" && Number.isFinite(value)) result.geometry.visualViewport[field] = value;
      else result.unavailable.push(`GEOMETRY_UNAVAILABLE:visualViewport.${field}`);
    } catch { result.unavailable.push(`GEOMETRY_UNAVAILABLE:visualViewport.${field}`); }
  }
  const g = result.geometry;
  result.ready = result.unavailable.length === 0 && g.innerWidth >= 320 && g.innerHeight >= 280
    && g.devicePixelRatio > 0 && g.scrollX === 0 && g.scrollY === 0
    && g.visualViewport.width > 0 && g.visualViewport.height > 0
    && g.visualViewport.offsetLeft === 0 && g.visualViewport.offsetTop === 0 && g.visualViewport.scale === 1;
  if (!result.ready && result.unavailable.length === 0) result.unavailable.push("REQUIRED_SYNTHETIC_GEOMETRY_FAILED");
  return result;
}

// These literals are executed in separate CUA invocations. A failed call or
// prerequisite stops the sequence; no retry, scheme substitution, or display.
export const fixedInvocation = {
  replaceTaskTab: "await tab.close(); calibrationRun.newTabs += 1; tab = await mastBrowser.tabs.new();",
  navigateSynthetic: "calibrationRun.syntheticPageNavigations += 1; await tab.goto(calibrationRun.control.page.dataUrl);",
  sample: "await tab.playwright.evaluate(calibrationRun.control.syntheticProjection, {phase, page:calibrationRun.control.page}, {timeoutMs:3000})",
  viewport: "calibrationRun.syntheticScreenshotCalls += 1; calibrationRun.viewportBytes = await tab.screenshot({fullPage:false});",
  clip: "calibrationRun.syntheticScreenshotCalls += 1; calibrationRun.clipBytes = await tab.screenshot({fullPage:false,clip:{x:16,y:32,width:272,height:224}});",
  phases: ["BEFORE_VIEWPORT", "BETWEEN_CAPTURES", "AFTER_CLIP"],
  candidateScales: "1_AND_OBSERVED_DEVICE_PIXEL_RATIO_DEDUPLICATED",
  screenshotOutput: "PRIVATE_VARIABLE_ONLY_NO_DISPLAY_HELPER_METADATA_ONLY_TOOL_OUTPUT",
  stopOnFailure: true,
  conditionalPrivateCapture: "Requires CALIBRATION_PASS; freeze private region and exact clipped invocation before its first screenshot. No private navigation on calibration failure.",
};
