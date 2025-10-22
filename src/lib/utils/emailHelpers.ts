import type { EmailAddress, EmailAttachment } from '$lib/types/slack';

/**
 * Format a list of email addresses for display
 *
 * @param addresses - Array of email addresses
 * @returns Comma-separated formatted string (e.g., "John <john@example.com>, Jane <jane@example.com>")
 *
 * @example
 * ```typescript
 * const addresses = [
 *   { name: "John Doe", address: "john@example.com", original: "..." }
 * ];
 * formatEmailAddress(addresses);
 * // Returns: "John Doe <john@example.com>"
 * ```
 */
export function formatEmailAddress(addresses?: EmailAddress[]): string {
	if (!addresses || addresses.length === 0) {
		return '';
	}

	return addresses
		.map((addr) => {
			// If name is different from address, show both
			if (addr.name && addr.name !== addr.address) {
				return `${addr.name} <${addr.address}>`;
			}
			// Otherwise just show the address
			return addr.address;
		})
		.join(', ');
}

/**
 * Get the primary sender's display name
 *
 * @param addresses - Array of sender addresses
 * @returns Display name or email address of first sender, or "Unknown"
 *
 * @example
 * ```typescript
 * getPrimarySender([{ name: "John", address: "john@example.com", original: "..." }]);
 * // Returns: "John"
 * ```
 */
export function getPrimarySender(addresses?: EmailAddress[]): string {
	if (!addresses || addresses.length === 0) {
		return 'Unknown';
	}

	const primary = addresses[0];

	// Prefer name over email address
	return primary.name || primary.address;
}

/**
 * Get short display for sender (first name or first part of email)
 *
 * @param addresses - Array of sender addresses
 * @returns Short display name suitable for thumbnails
 *
 * @example
 * ```typescript
 * getShortSender([{ name: "John Doe", address: "john@example.com", original: "..." }]);
 * // Returns: "John Doe"
 * ```
 */
export function getShortSender(addresses?: EmailAddress[]): string {
	if (!addresses || addresses.length === 0) {
		return 'Unknown';
	}

	const primary = addresses[0];

	// Use name if available
	if (primary.name) {
		return primary.name;
	}

	// Otherwise extract username from email
	return primary.address.split('@')[0];
}

/**
 * Format attachment count for display
 *
 * @param count - Number of attachments
 * @returns Formatted text (e.g., "1 attachment", "3 attachments")
 *
 * @example
 * ```typescript
 * getAttachmentCountText(1);  // Returns: "1 attachment"
 * getAttachmentCountText(5);  // Returns: "5 attachments"
 * getAttachmentCountText(0);  // Returns: ""
 * ```
 */
export function getAttachmentCountText(count?: number): string {
	if (!count || count === 0) {
		return '';
	}

	return count === 1 ? '1 attachment' : `${count} attachments`;
}

/**
 * Get icon emoji for attachment based on MIME type
 *
 * @param mimetype - MIME type of the attachment
 * @returns Emoji representing the file type
 *
 * @example
 * ```typescript
 * getAttachmentIcon("application/pdf");  // Returns: "📄"
 * getAttachmentIcon("image/png");        // Returns: "🖼️"
 * getAttachmentIcon("application/zip");  // Returns: "📦"
 * ```
 */
export function getAttachmentIcon(mimetype: string): string {
	const type = mimetype.toLowerCase();

	// Archive files
	if (
		type.includes('zip') ||
		type.includes('rar') ||
		type.includes('7z') ||
		type.includes('tar') ||
		type.includes('gz')
	) {
		return '📦';
	}

	// PDF files
	if (type.includes('pdf')) {
		return '📄';
	}

	// Image files
	if (type.startsWith('image/')) {
		return '🖼️';
	}

	// Word documents
	if (
		type.includes('word') ||
		type.includes('document') ||
		type.includes('msword') ||
		type.includes('officedocument.wordprocessingml')
	) {
		return '📝';
	}

	// Excel spreadsheets
	if (
		type.includes('excel') ||
		type.includes('spreadsheet') ||
		type.includes('ms-excel') ||
		type.includes('officedocument.spreadsheetml')
	) {
		return '📊';
	}

	// PowerPoint presentations
	if (
		type.includes('powerpoint') ||
		type.includes('presentation') ||
		type.includes('ms-powerpoint') ||
		type.includes('officedocument.presentationml')
	) {
		return '📽️';
	}

	// Video files
	if (type.startsWith('video/')) {
		return '🎬';
	}

	// Audio files
	if (type.startsWith('audio/')) {
		return '🎵';
	}

	// Text files
	if (type.startsWith('text/')) {
		return '📃';
	}

	// Default
	return '📎';
}

/**
 * Truncate email subject for thumbnail display
 *
 * @param subject - Full email subject
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated subject with ellipsis if needed
 *
 * @example
 * ```typescript
 * truncateSubject("This is a very long email subject that needs truncating", 30);
 * // Returns: "This is a very long email s..."
 * ```
 */
export function truncateSubject(subject: string, maxLength: number = 50): string {
	if (!subject) {
		return '';
	}

	if (subject.length <= maxLength) {
		return subject;
	}

	return subject.substring(0, maxLength - 3) + '...';
}

/**
 * Validate attachment before download
 *
 * @param attachment - Email attachment to validate
 * @returns Object with valid flag and optional warning message
 *
 * @example
 * ```typescript
 * const result = validateAttachment(attachment);
 * if (!result.valid) {
 *   showError('Invalid attachment', result.message);
 * }
 * ```
 */
export function validateAttachment(attachment: EmailAttachment): {
	valid: boolean;
	message?: string;
	warning?: string;
} {
	// Check if attachment exists
	if (!attachment || !attachment.url) {
		return {
			valid: false,
			message: 'Invalid attachment data'
		};
	}

	// Size limit: 100MB
	const MAX_SIZE = 100 * 1024 * 1024;
	if (attachment.size > MAX_SIZE) {
		return {
			valid: false,
			message: `File exceeds 100MB limit (${(attachment.size / 1024 / 1024).toFixed(1)}MB)`
		};
	}

	// Warn about potentially dangerous file types
	const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.js', '.vbs', '.ps1'];
	const filename = attachment.filename.toLowerCase();
	const hasDangerousExt = dangerousExtensions.some((ext) => filename.endsWith(ext));

	if (hasDangerousExt) {
		return {
			valid: true,
			warning: `${attachment.filename} may contain executable code. Download with caution.`
		};
	}

	return { valid: true };
}
