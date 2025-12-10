// Job validation
exports.validateJobPost = (req, res, next) => {
  const { title, description, company, location } = req.body;
  
  if (!title || title.trim().length < 5) {
    return res.status(400).json({ 
      success: false,
      error: 'Title must be at least 5 characters' 
    });
  }
  
  if (!description || description.trim().length < 20) {
    return res.status(400).json({ 
      success: false,
      error: 'Description must be at least 20 characters' 
    });
  }
  
  if (!company || company.trim().length < 2) {
    return res.status(400).json({ 
      success: false,
      error: 'Company name is required' 
    });
  }
  
  if (!location || location.trim().length < 3) {
    return res.status(400).json({ 
      success: false,
      error: 'Location is required' 
    });
  }
  
  next();
};

// File upload validation
exports.validateFileUpload = (req, res, next) => {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (!req.file) {
    return next();
  }
  
  if (req.file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ 
      success: false,
      error: 'File size must be less than 5MB' 
    });
  }
  
  if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
    return res.status(400).json({ 
      success: false,
      error: 'Only PDF and DOC/DOCX files are allowed' 
    });
  }
  
  next();
};