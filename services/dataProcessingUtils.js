const { validateCustomFieldValue } = require('./serviceUtils');

async function updateCustomFieldsData(analysis, doc, updateData, config, paperlessService) {
  // Only process custom fields if custom fields detection is activated
  if (
    config.limitFunctions?.activateCustomFields === 'no' ||
    !analysis.document.custom_fields
  ) {
    console.log('[DEBUG] no processing of customFields.');
    return;
  }

  const customFields = analysis.document.custom_fields;
  const processedFields = [];
  const customFieldsForHistory = [];

  console.log('[DEBUG] updateCustomFieldsData:', customFields);

  // Get existing custom fields
  const existingFields = await paperlessService.getExistingCustomFields(doc.id);
  console.debug('Found existing fields:', existingFields);

  // Keep track of which fields we've processed to avoid duplicates
  const processedFieldIds = new Set();

  // First, add any new/updated fields
  for (const key in customFields) {
    const customField = customFields[key];

    if (
      !customField.field_name ||
      customField.value === null ||
      customField.value === undefined ||
      String(customField.value).trim() === ''
    ) {
      console.debug('Skipping empty or invalid custom field');
      continue;
    }

    const fieldDetails = await paperlessService.findExistingCustomField(
      customField.field_name
    );
    if (fieldDetails?.id) {
      const validation = validateCustomFieldValue(
        customField.field_name,
        customField.value,
        fieldDetails.data_type
      );
      if (validation.skip) {
        if (validation.warn) console.warn(validation.warn);
        continue;
      }
      processedFields.push({
        field: fieldDetails.id,
        value: validation.value,
      });
      // Capture name + validated value for history at the point where we have both
      customFieldsForHistory.push({
        field_name: customField.field_name,
        value: validation.value,
      });
      processedFieldIds.add(fieldDetails.id);
    }
  }

  // Then add any existing fields that weren't updated
  for (const existingField of existingFields) {
    if (!processedFieldIds.has(existingField.field)) {
      processedFields.push(existingField);
    }
  }

  if (processedFields.length > 0) {
    updateData.custom_fields = processedFields;
  }
  if (customFieldsForHistory.length > 0) {
    updateData._customFieldsForHistory = customFieldsForHistory;
  }
}

async function updateDocumentTypeData(analysis, updateData, config, paperlessService, options = {}) {
  if (config.limitFunctions?.activateDocumentType === 'no' || !analysis.document.document_type) {
    return;
  }

  try {
    const documentType = await paperlessService.getOrCreateDocumentType(
      analysis.document.document_type,
      options
    );
    if (documentType) {
      updateData.document_type = documentType.id;
    }
  } catch (error) {
    console.error(`[ERROR] Error processing document type: ${error.message}`);
    console.debug(error);
  }
}

async function updateCorrespondentData(analysis, updateData, config, paperlessService, options = {}) {
  if (config.limitFunctions?.activateCorrespondents === 'no' || !analysis.document.correspondent) {
    return;
  }

  try {
    const correspondent = await paperlessService.getOrCreateCorrespondent(
      analysis.document.correspondent,
      options
    );
    if (correspondent) {
      updateData.correspondent = correspondent.id;
    }
  } catch (error) {
    console.error(`[ERROR] Error processing correspondent: ${error.message}`);
    console.debug(error);
  }
}

module.exports = {
  updateCustomFieldsData,
  updateDocumentTypeData,
  updateCorrespondentData
};
