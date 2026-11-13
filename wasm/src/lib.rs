use serde_json::Value;
use wasm_bindgen::prelude::*;
use vtracer::{Clustering, ColorImage, Config, FitMode, Hierarchical, Preset};

fn as_u64(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn as_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

fn as_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn as_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

fn as_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

fn make_config(options: &Value) -> Config {
    let preset = match as_str(options, "preset") {
        Some("bw") => Preset::Bw,
        Some("photo") => Preset::Photo,
        Some("poster") => Preset::Poster,
        _ => return configure(Config::default(), options),
    };
    configure(Config::from_preset(preset), options)
}

fn configure(mut config: Config, options: &Value) -> Config {
    config.clustering = match as_str(options, "clustering") {
        Some("bw") | Some("binary") => Clustering::Binary,
        Some("watershed") => Clustering::Watershed,
        _ => Clustering::ColorCluster,
    };

    config.hierarchical = match as_str(options, "hierarchical") {
        Some("cutout") | Some("mosaic") => Hierarchical::Cutout,
        _ => Hierarchical::Stacked,
    };

    config.mode = match as_str(options, "mode") {
        Some("pixel") => FitMode::Pixel,
        Some("polygon") => FitMode::Polygon,
        _ => FitMode::Spline,
    };

    if let Some(value) = as_u64(options, "filterSpeckle") { config.filter_speckle = value.min(128) as usize; }
    if let Some(value) = as_i64(options, "colorPrecision") { config.color_precision = value.clamp(1, 8) as i32; }
    if let Some(value) = as_i64(options, "layerDifference") { config.layer_difference = value.clamp(0, 255) as i32; }
    if let Some(value) = as_i64(options, "cornerThreshold") { config.corner_threshold = value.clamp(0, 180) as i32; }
    if let Some(value) = as_f64(options, "lengthThreshold") { config.length_threshold = value.clamp(0.1, 100.0); }
    if let Some(value) = as_u64(options, "maxIterations") { config.max_iterations = value.clamp(1, 100) as usize; }
    if let Some(value) = as_i64(options, "spliceThreshold") { config.splice_threshold = value.clamp(0, 180) as i32; }
    config.simplify = as_f64(options, "simplify").map(|value| value.clamp(0.0, 20.0));
    config.path_precision = as_u64(options, "pathPrecision").map(|value| value.clamp(0, 6) as u32);
    config.max_colors = as_u64(options, "maxColors").map(|value| value.clamp(2, 256) as usize);
    if let Some(value) = as_u64(options, "optimize") { config.optimize = value.min(2) as u8; }
    if let Some(value) = as_u64(options, "binaryThreshold") { config.binary_threshold = value.min(255) as u8; }
    if let Some(value) = as_bool(options, "adaptive") { config.binary_adaptive = value; }
    if let Some(value) = as_u64(options, "adaptiveWindow") { config.binary_adaptive_window = value.min(4096) as u32; }
    if let Some(value) = as_f64(options, "adaptiveT") { config.binary_adaptive_t = value.clamp(0.0, 100.0); }
    if let Some(value) = as_u64(options, "watershedDetail") { config.watershed_detail = value.min(255) as u32; }
    config
}

/// Convert decoded RGBA8 pixels into a real, editable SVG document.
/// Image decoding remains in the browser; no file or network I/O occurs here.
#[wasm_bindgen]
pub fn convert(rgba: &[u8], width: u32, height: u32, config_json: &str) -> Result<String, JsValue> {
    if width == 0 || height == 0 {
        return Err(JsValue::from_str("A imagem tem dimensões inválidas."));
    }

    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| JsValue::from_str("As dimensões da imagem excedem o limite suportado."))?;

    if rgba.len() != expected {
        return Err(JsValue::from_str("O buffer RGBA não corresponde às dimensões informadas."));
    }

    let options: Value = serde_json::from_str(config_json)
        .map_err(|error| JsValue::from_str(&format!("Configuração inválida: {error}")))?;
    let image = ColorImage {
        pixels: rgba.to_vec(),
        width: width as usize,
        height: height as usize,
    };

    make_config(&options)
        .build()
        .map_err(|error| JsValue::from_str(&format!("Falha ao preparar VTracer: {error}")))?
        .to_svg(&image)
        .map_err(|error| JsValue::from_str(&format!("Falha durante a vetorização: {error}")))
}

#[wasm_bindgen]
pub fn engine_version() -> String {
    "VTracer 1.0.0-alpha.4".to_string()
}
