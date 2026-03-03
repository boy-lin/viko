pub fn run_pipeline<A, R, I, O, FA, FR, FI, FP, FF>(
    _pipeline_name: &str,
    analyze: FA,
    resolve: FR,
    init: FI,
    process: FP,
    finalize: FF,
) -> Result<O, String>
where
    FA: FnOnce() -> Result<A, String>,
    FR: FnOnce(&A) -> Result<R, String>,
    FI: FnOnce(&A, &R) -> Result<I, String>,
    FP: FnOnce(&mut I) -> Result<(), String>,
    FF: FnOnce(A, R, I) -> Result<O, String>,
{
    let analyze_result = analyze()?;
    let resolve_result = resolve(&analyze_result)?;
    let mut init_result = init(&analyze_result, &resolve_result)?;
    process(&mut init_result)?;
    finalize(analyze_result, resolve_result, init_result)
}
