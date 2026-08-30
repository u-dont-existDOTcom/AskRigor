# frozen_string_literal: true

require "json"
require "securerandom"

unless ENV.fetch("ASKRIGOR_SYNTHETIC_ONLY", "") == "true"
  abort "refusing to seed without ASKRIGOR_SYNTHETIC_ONLY=true"
end

SYNTHETIC_DOMAIN = "synthetic.askrigor.invalid"
SYNTHETIC_MARKER = "SYNTHETIC — NOT REAL HEALTH DATA"

SiteSetting.allow_index_in_robots_txt = false
SiteSetting.overridden_robots_txt = "User-agent: *\nDisallow: /\n"
SiteSetting.disable_emails = "yes"
SiteSetting.login_required = false
SiteSetting.allow_new_registrations = false
SiteSetting.tagging_enabled = true

def synthetic_user(username, name)
  email = "#{username}@#{SYNTHETIC_DOMAIN}"
  user = User.with_email(email).first || User.find_by(username: username)

  if user
    unless user.email&.end_with?("@#{SYNTHETIC_DOMAIN}")
      abort "refusing to reuse a non-synthetic account for #{username}"
    end
  else
    user = User.create!(
      email: email,
      username: username,
      name: name,
      password: SecureRandom.base64(48),
      approved: true,
      active: true,
    )
  end
  user.email_tokens.update_all(confirmed: true)
  user.activate
  user.change_trust_level!(1) if user.trust_level < 1
  user
end

def synthetic_category(name:, description:, permissions:)
  category = Category.find_or_initialize_by(name: name)
  category.assign_attributes(
    description: "#{SYNTHETIC_MARKER}. #{description}",
    user_id: Discourse::SYSTEM_USER_ID,
    color: "3B82F6",
    text_color: "FFFFFF",
  )
  category.skip_category_definition = true
  category.set_permissions(permissions)
  category.save!
  category
end

def synthetic_topic(user:, category:, title:, body:)
  existing = Topic.find_by(title: title, category_id: category.id)
  return existing if existing

  post = PostCreator.create!(
    user,
    title: title,
    raw: "#{SYNTHETIC_MARKER}.\n\n#{body}",
    category: category.id,
    skip_jobs: true,
  )
  abort "failed to create #{title}: #{post.errors.full_messages.join(', ')}" unless post.persisted?
  post.topic
end

reporter = synthetic_user("synthetic_reporter", "Synthetic Reporter")
subject = synthetic_user("synthetic_subject", "Synthetic Subject")
moderator = synthetic_user("synthetic_moderator", "Synthetic Moderator")
researcher = synthetic_user("synthetic_researcher", "Synthetic Researcher")

moderation_group = Group.find_or_create_by!(name: "askrigor_synth_mods")
GroupUser.find_or_create_by!(group: moderation_group, user: moderator)

public_leads = synthetic_category(
  name: "Synthetic Public Research Leads",
  description: "Deidentified secondhand reports may appear here as research leads; public visibility does not increase evidentiary strength.",
  permissions: { everyone: :full },
)
member_reports = synthetic_category(
  name: "Synthetic Member Reports",
  description: "Member-only fixture reports for helped, harmed, no-effect, regimen, laboratory, and correction workflows.",
  permissions: { trust_level_0: :full },
)
moderation_review = synthetic_category(
  name: "Synthetic Moderation Review",
  description: "Private fixture queue for moderation and privacy review.",
  permissions: { moderation_group => :full },
)

synthetic_topic(
  user: reporter,
  category: public_leads,
  title: "Synthetic secondhand signal for independent follow-up",
  body: "A fictional secondhand report is preserved only as a low-strength research lead. It is not a verified outcome, study result, medical recommendation, or effectiveness claim.",
)
synthetic_topic(
  user: subject,
  category: member_reports,
  title: "Synthetic no-effect report with follow-up questions",
  body: "This invented fixture records a no-effect direction and leaves timing, adherence, alternative explanations, and verification unresolved.",
)
synthetic_topic(
  user: moderator,
  category: moderation_review,
  title: "Synthetic privacy and abuse review fixture",
  body: "This private fixture represents a pending review. It contains no person, place, contact detail, recruitment language, or regulatory report.",
)

permission_checks = {
  anonymousCanSeePublic: Guardian.new.can_see?(public_leads),
  anonymousCannotSeeMembersOnly: !Guardian.new.can_see?(member_reports),
  anonymousCannotSeePrivateModeration: !Guardian.new.can_see?(moderation_review),
  memberCanCreateMemberReport: Guardian.new(subject).can_create?(Topic, member_reports),
  ordinaryMemberCannotSeePrivateModeration: !Guardian.new(researcher).can_see?(moderation_review),
  moderatorCanCreatePrivateReview: Guardian.new(moderator).can_create?(Topic, moderation_review),
}
abort "synthetic permission fixture mismatch" unless permission_checks.values.all?

human_users = User.human_users.to_a
non_synthetic_humans = human_users.reject { |user| user.email&.end_with?("@#{SYNTHETIC_DOMAIN}") }
abort "non-synthetic human account detected" if non_synthetic_humans.any?
fixture_category_ids = [public_leads.id, member_reports.id, moderation_review.id]
fixture_topics = Topic.where(category_id: fixture_category_ids)
all_fixture_posts_marked_synthetic = Post.where(topic_id: fixture_topics.select(:id)).pluck(:raw).all? do |raw|
  raw.include?(SYNTHETIC_MARKER)
end
abort "unmarked forum fixture detected" unless all_fixture_posts_marked_synthetic

result = {
  schemaVersion: 1,
  marker: SYNTHETIC_MARKER,
  syntheticOnly: true,
  humanUserCount: human_users.size,
  syntheticHumanUserCount: human_users.size,
  categoryCount: [public_leads, member_reports, moderation_review].size,
  topicCount: fixture_topics.count,
  allFixturePostsMarkedSynthetic: all_fixture_posts_marked_synthetic,
  permissionFixtures: {
    public: public_leads.name,
    membersOnly: member_reports.name,
    privateModeration: moderation_review.name,
  },
  permissionChecks: permission_checks,
  settings: {
    allowIndexInRobotsTxt: SiteSetting.allow_index_in_robots_txt,
    robotsOverride: SiteSetting.overridden_robots_txt,
    disableEmails: SiteSetting.disable_emails,
    loginRequired: SiteSetting.login_required,
    allowNewRegistrations: SiteSetting.allow_new_registrations,
    taggingEnabled: SiteSetting.tagging_enabled,
  },
}

puts "ASKRIGOR_SYNTHETIC_SEED=#{JSON.generate(result)}"
