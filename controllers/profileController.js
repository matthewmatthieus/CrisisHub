const path = require('path');
const { validationResult } = require('express-validator');
const userModel = require('../models/userModel');
const profileModel = require('../models/profileModel');
const activityModel = require('../models/activityModel');

/**
 * Converts express-validator errors into a simple object map.
 */
function mapValidationErrors(validationErrors) {
    return validationErrors.array().reduce((accumulator, current) => {
        if (!accumulator[current.path]) {
            accumulator[current.path] = current.msg;
        }
        return accumulator;
    }, {});
}

/**
 * Renders profile details and activity history.
 */
async function showProfile(req, res) {
    const userId = req.session.user.user_id;

    try {
        const user = await userModel.findById(userId);
        const profile = await profileModel.getByUserId(userId);
        const activity = await activityModel.getByUserId(userId, 20);
        const reputation = await userModel.getReputation(userId);

        return res.render('profile', {
            user,
            profile,
            activity,
            reputation
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load profile.';
        return res.redirect('/dashboard');
    }
}

/**
 * Renders profile edit form.
 */
async function showEditProfile(req, res) {
    const userId = req.session.user.user_id;

    try {
        const user = await userModel.findById(userId);
        const profile = (await profileModel.getByUserId(userId)) || {
            full_name: '',
            phone: '',
            address: '',
            bio: ''
        };

        return res.render('editProfile', {
            user,
            profile,
            errors: {},
            formData: {
                full_name: profile.full_name,
                phone: profile.phone,
                address: profile.address,
                bio: profile.bio,
                profile_picture_filename: user.profile_picture || ''
            }
        });
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to load profile editor.';
        return res.redirect('/profile');
    }
}

/**
 * Processes profile updates and optional profile picture upload.
 */
async function updateProfile(req, res) {
    const userId = req.session.user.user_id;
    const validationErrors = validationResult(req);

    if (!validationErrors.isEmpty()) {
        const user = await userModel.findById(userId);
        return res.status(422).render('editProfile', {
            user,
            profile: req.body,
            errors: mapValidationErrors(validationErrors),
            formData: req.body
        });
    }

    try {
        let profilePictureFilename = (req.body.profile_picture_filename || '').trim();

        if (req.files && req.files.profile_picture) {
            const upload = req.files.profile_picture;
            const extension = path.extname(upload.name).toLowerCase();
            const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

            if (!allowedExtensions.includes(extension)) {
                const user = await userModel.findById(userId);
                return res.status(422).render('editProfile', {
                    user,
                    profile: req.body,
                    errors: { profile_picture: 'Only PNG, JPG, JPEG, GIF and WEBP files are allowed.' },
                    formData: req.body
                });
            }

            profilePictureFilename = `${Date.now()}_${upload.name.replace(/\s+/g, '_')}`;
            const savePath = path.join(__dirname, '..', 'public', 'uploads', 'profiles', profilePictureFilename);
            await upload.mv(savePath);
        }

        await profileModel.upsertByUserId(userId, {
            full_name: (req.body.full_name || '').trim(),
            phone: (req.body.phone || '').trim(),
            address: (req.body.address || '').trim(),
            bio: (req.body.bio || '').trim()
        });

        if (profilePictureFilename) {
            await userModel.updateProfilePicture(userId, profilePictureFilename);
        }

        await activityModel.logActivity(userId, 'Updated profile');

        req.session.success = 'Profile updated successfully.';
        return res.redirect('/profile');
    } catch (error) {
        console.error(error);
        req.session.error = 'Unable to update profile.';
        return res.redirect('/profile/edit');
    }
}

module.exports = {
    showProfile,
    showEditProfile,
    updateProfile
};