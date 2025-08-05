// The models package - contains the web data.
package models

// Import GORM to insert gorm.Model (which provides ID and other base fields what helps us to manage our site).
import "gorm.io/gorm"

// The Call struct represents the "calls" table in the database.
type Call struct {
	gorm.Model // gorm.Model adds fields like ID, CreatedAt, UpdatedAt, and DeletedAt.

	// JSON tags make the fields use snake_case in API data instead of Go’s CamelCase.
	CallerEmail   string `json:"caller_email"`
	ReceiverEmail string `json:"receiver_email"`
	Status        string `json:"status"` // "pending" | "accepted" | "rejected" | "ended"
}
