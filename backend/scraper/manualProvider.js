export class ManualProvider {
  async collect() {
    return {
      success: false,
      errorCode: 'MANUAL_INPUT_REQUIRED',
      errorMessage: 'Manual mode is active. Add an observation using the manual reading form.'
    };
  }
}
