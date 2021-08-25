export default
`#version 300 es
precision mediump float;

layout(location=0) out vec4 outColor;

uniform vec2 u_resolution;
uniform float time;

//--- Parameters
#define SAMPLES_PER_PIXEL 20
#define MAX_DEPTH 10

#define PI 3.1415926535


//--- Utility
vec2 randState;

float hash( const float n ) 
{
    return fract(sin(n)*43758.54554213);
}

// bad random :(
float random(){
    randState.x = fract(sin(dot(randState.xy + time, vec2(12.9898, 78.233))) * 43758.5453);
    randState.y = fract(sin(dot(randState.xy + time, vec2(12.9898, 78.233))) * 43758.5453);
    
    return randState.x;
}

vec3 random_in_unit_sphere()
{
    float phi = 2.0 * PI * random();
    float cosTheta = 2.0 * random() - 1.0;
    float u = random();

    float theta = acos(cosTheta);
    float r = pow(u, 1.0 / 3.0);

    float x = r * sin(theta) * cos(phi);
    float y = r * sin(theta) * sin(phi);
    float z = r * cos(theta);

    return vec3(x, y, z);
}

vec3 random_unit_vector()
{
    return normalize(random_in_unit_sphere());
}

bool near_zero(vec3 v)
{
    return ((v.x < 1e-8) && (v.y < 1e-8) && (v.z < 1e-8));
}

//-------------------------------------------------------------------------
//---------------Structures------------------------------------------------
//-------------------------------------------------------------------------

struct sphere {
    vec3 center; float radius;
    int material_type; vec3 albedo; float fuzz; // material
};

struct ray {
    vec3 orig; vec3 dir;
};

struct hit_record {
    vec3 p; vec3 normal; float t; bool front_face;
    int material_type; vec3 albedo; float fuzz; // material
};

struct camera {
    vec3 origin; vec3 lower_left_corner; vec3 horizontal; vec3 vertical;
};

//------------------------------------------------------------------------


//--- Material related
#define LAMBERT 1
#define METAL 2

vec3 reflect(vec3 v, vec3 n) {
    return v - 2.0*dot(v,n)*n;
}

bool scatter(ray r_in, hit_record rec, out vec3 atten, out ray scattered)
{
    if(rec.material_type == 2) 
    {
        vec3 reflected = reflect(normalize(r_in.dir), rec.normal);
        scattered = ray(rec.p, reflected + rec.fuzz * random_in_unit_sphere());
        atten = rec.albedo;
        return (dot(scattered.dir, rec.normal) > 0.0);
    }
    else // Lambertian fallback
    {
        vec3 target = rec.p + rec.normal + random_in_unit_sphere();
        vec3 scatter_direction = target-rec.p;
        //vec3 scatter_direction = rec.normal + random_unit_vector(); // doesn't work well...

        if(near_zero(scatter_direction))
            scatter_direction = rec.normal;

        scattered = ray(rec.p, scatter_direction);
        atten = rec.albedo;

        return true;
    }

    return false;
}


//--- Scene(sphere) related
const int SPHERE_COUNT = 4;

sphere sceneList[] = sphere[SPHERE_COUNT](
                  // origin             radius    material type           albedo           fuzzy
    sphere(vec3(   0,-100.5,    -1.0),   100.0,    LAMBERT,    vec3(0.5,    0.5,    0.5),    0.0), //ground
    sphere(vec3(   0,     0,    -1.0),     0.5,    LAMBERT,    vec3(0.7,    0.3,    0.3),    0.0), //center
    sphere(vec3(-1.0,     0,    -1.0),     0.5,      METAL,    vec3(0.8,    0.8,    0.8),    0.3), //left
    sphere(vec3( 1.0,     0,    -1.0),     0.5,      METAL,    vec3(0.8,    0.6,    0.2),    1.0)  //right
);

//--- Ray & Hit Record related

vec3 ray_at(ray r, float t)
{
    return r.orig + t*r.dir;
}

void set_face_normal(out hit_record rec, ray r, vec3 outward_normal)
{
    rec.front_face = dot(r.dir, outward_normal) < 0.0;
    rec.normal = rec.front_face ? outward_normal : -outward_normal;
}

//--- Ray trace related
bool hit_sphere(sphere s, ray r, float t_min, float t_max, out hit_record rec) {
    vec3 oc = r.orig - s.center;
    float a = dot(r.dir, r.dir);
    float half_b = dot(oc, r.dir);
    float c = dot(oc, oc) - s.radius*s.radius;
    float discriminant = half_b*half_b - a*c;
    
    if(discriminant < 0.0)
    {
        return false;
    }
    float sqrtd = sqrt(discriminant);
    
    float root = (-half_b - sqrtd) / a;
    if(root < t_min || root > t_max)
    {
        root = (-half_b + sqrtd) / a;
        if(root < t_min || root > t_max)
        {
            return false;
        }
    }

    rec.t = root;
    rec.p = ray_at(r, rec.t);
    vec3 outward_normal = (rec.p - s.center)/s.radius;
    set_face_normal(rec, r, outward_normal);
    rec.material_type = s.material_type;
    rec.albedo = s.albedo;
    rec.fuzz = s.fuzz;

    return true;
}

bool hit_scene(ray r, float t_min, float t_max, out hit_record rec)
{
    hit_record temp_rec;
    bool hit_anything = false;
    float closest_so_far = t_max;

    for (int i=0;i<SPHERE_COUNT;i++)
    {
        if(hit_sphere(sceneList[i], r, t_min, t_max, temp_rec) && temp_rec.t < closest_so_far)
        {
            hit_anything = true;
            closest_so_far = temp_rec.t;
            rec = temp_rec;
        }
    }

    return hit_anything;
}

vec3 ray_color(ray r)
{
    hit_record rec;

    vec3 color = vec3(1.0);

    for(int i=0;i<MAX_DEPTH;i++)
    {
        bool is_hit = hit_scene(r, 0.001, 10000.0, rec);

        if(is_hit)
        {
            vec3 atten_color;
            ray scattered_ray;
            if(scatter(r, rec, atten_color, scattered_ray))
            {
                color = color * atten_color;
                r = scattered_ray;
            }
            else
            {
                return vec3(0,0,0);
            }
        }
        else
        {
            vec3 unit_direction = normalize(r.dir);
            float t = 0.5*(unit_direction.y + 1.0);
            color = color * ((1.0-t)*vec3(1.0, 1.0, 1.0) + t*vec3(0.5, 0.7, 1.0));
            break;
        }
    }

    return color;
}

//--- Camera related
camera make_camera()
{
    float aspect_ratio = u_resolution.x / u_resolution.y;
    float viewport_height = 2.0;
    float viewport_width = aspect_ratio * viewport_height;
    float focal_length = 1.0;

    camera cam;
    cam.origin = vec3(0,0,0);
    cam.horizontal = vec3(viewport_width, 0, 0);
    cam.vertical = vec3(0, viewport_height, 0);
    cam.lower_left_corner = cam.origin - cam.horizontal*0.5 - cam.vertical*0.5 - vec3(0,0,focal_length);
    return cam;
}

ray get_ray(camera cam, float u, float v)
{
    return ray(cam.origin, cam.lower_left_corner + u*cam.horizontal + v*cam.vertical - cam.origin);
}

void main() {
    randState = gl_FragCoord.xy / u_resolution.xy;

    camera cam = make_camera();

    vec3 pixel_color = vec3(0,0,0);
    
    for(int s=0; s < SAMPLES_PER_PIXEL; s++)
    {
        float u = float(gl_FragCoord.x + random()) / float(u_resolution.x);
        float v = float(gl_FragCoord.y + random()) / float(u_resolution.y);

        ray r = get_ray(cam, u, v);
        pixel_color = pixel_color + ray_color(r);
    }
    pixel_color = pixel_color * (1.0/float(SAMPLES_PER_PIXEL));

    outColor = vec4(sqrt(pixel_color),1.0);
    //outColor = vec4(random(),random(),random(),1.0);
}
`;